// controllers/orderController.js
const axios = require('axios');
const { createCashfreePayload, getCashfreeHeaders } = require('../utils/cashfree');

// ======================= CREATE ORDER =======================
const Order = require('../models/orderModel'); // adjust the path based on your project structure

const createOrder = async (req, res) => {
  try {
    const { cart, customer, user_id } = req.body;

    if (!Array.isArray(cart) || cart.length === 0 || !customer?.pincode) {
      return res.status(400).json({ error: 'Missing cart or customer pincode' });
    }

    const pincode = customer.pincode;

    // ✅ 1. Fetch products available for this pincode only
    const productRes = await axios.get(`https://products-fetch.onrender.com/api/products?pincode=${pincode}`);
    const productsData = productRes.data;

    // ✅ 2. Validate cart and extract price info directly
    const validatedCart = cart.map(item => {
      const matchedProduct = productsData.find(p => p._id === item.productId);
      if (!matchedProduct) {
        throw new Error(`Product not available for pincode ${pincode}: ${item.productId}`);
      }

      return {
        productId: matchedProduct._id,
        name: matchedProduct.name,
        price: matchedProduct.price,
        quantity: item.quantity,
        subtotal: matchedProduct.price * item.quantity,
      };
    });

    // ✅ 3. Calculate total
    const totalAmount = validatedCart.reduce((sum, item) => sum + item.subtotal, 0);
    // ✅ Enforce minimum order amount
if (totalAmount < 10) {
  return res.status(400).json({ error: 'Minimum order amount is ₹10.' });
}
    const orderId = 'ORDER_' + Date.now();

    // ✅ 4. Prepare payload for Cashfree (optional if not COD)
    const payload = createCashfreePayload(orderId, customer, totalAmount, validatedCart, user_id);

    const cfRes = await axios.post('https://sandbox.cashfree.com/pg/orders', payload, {
      headers: getCashfreeHeaders(),
    });

    // ✅ 5. Save order
    const newOrder = new Order({
      orderId,
      cart: validatedCart.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      user_id,
      customer,
      totalAmount,
      paymentSessionId: cfRes.data.payment_session_id,
      paymentStatus: 'pending',
      paymentMode: null,
      orderStatus: null,
      deliveryStatus: null,
    });

    await newOrder.save();

    return res.json({
      payment_session_id: cfRes.data.payment_session_id,
      order_id: orderId,
    });

  } catch (err) {
    console.error('❌ Create Order Error:', err.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to create order',
      details: err.response?.data || err.message,
    });
  }
};




// ======================= CHECK PAYMENT STATUS =======================
const getPaymentStatus = async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });

  try {
    const statusRes = await axios.get(`https://sandbox.cashfree.com/pg/orders/${order_id}`, {
      headers: getCashfreeHeaders(),
    });

    const status = statusRes.data.order_status;
    return res.json({ status: status.toUpperCase() });
  } catch (err) {
    console.error('❌ Status Check Error:', err.message);
    return res.status(500).json({ error: 'Failed to get payment status' });
  }
};

// ======================= (Optional) WEBHOOK =======================


const cashfreeWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;
    const orderId = data?.order?.order_id;
    const paymentStatusRaw = data?.payment?.payment_status;
    const paymentMethodGroup = data?.payment?.payment_group;
    let paymentMethodDetails = '';

if (paymentMethodGroup === 'upi' && data?.payment?.payment_method?.upi?.upi_id) {
  paymentMethodDetails = `UPI: ${data.payment.payment_method.upi.upi_id}`;
} else if (paymentMethodGroup === 'card' && data?.payment?.payment_method?.card?.card_number) {
  paymentMethodDetails = `Card: ${data.payment.payment_method.card.card_number}`;
} else {
  paymentMethodDetails = paymentMethodGroup || 'unknown';
}

    

    console.log(`📦 Webhook received: ${type} for order ${orderId}, status: ${paymentStatusRaw}`);
    console.log('🔔 Webhook payload:', JSON.stringify(req.body, null, 2));

    if (!orderId || !paymentStatusRaw) {
      return res.status(400).json({ error: 'Missing required data in webhook payload' });
    }

    // 1. Translate Cashfree status
    let paymentStatus = 'pending';
    let orderStatus = null;

    if (paymentStatusRaw === 'SUCCESS') {
      paymentStatus = 'paid';
      orderStatus = 'confirmed';
    } else if (paymentStatusRaw === 'FAILED') {
      paymentStatus = 'failed';
      orderStatus = 'cancelled';
    }

    // 2. Update order in MongoDB
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      {
        paymentStatus,
        paymentMode: paymentMethodGroup || null,
        orderStatus,
      },
      { new: true }
    );

    if (!updatedOrder) {
      console.warn(`⚠️ No order found for orderId: ${orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`✅ Order ${orderId} updated successfully in MongoDB`);

    // 3. Push to user database
    const userId = updatedOrder.user_id?.toString(); // ensure it's string
    if (userId && process.env.INTERNAL_API_KEY) {

const orderPayload = {
  order: {
    orderId: updatedOrder.orderId,
    orderStatus: updatedOrder.orderStatus,
    paymentStatus: updatedOrder.paymentStatus,
    paymentMethod: paymentMethodDetails, // ✅ NEW FIELD
    deliveryStatus: updatedOrder.deliveryStatus || 'pending',
    returnStatus: 'none',
    items: Array.isArray(updatedOrder.cart)
      ? updatedOrder.cart
          .filter(item =>
            item?.productId && item?.name && item?.quantity != null && item?.price != null
          )
          .map(item => ({
            itemId: item.productId,
            itemName: item.name,
            quantity: item.quantity,
            price: item.price,
          }))
      : [],
    totalPrice: updatedOrder.totalAmount,
    orderDate: updatedOrder.createdAt,
  },
};




      try {
        const response = await axios.post(
          `http://localhost:3000/api/users/${userId}/orders`,
          orderPayload,
          {
            headers: {
              'x-internal-api-key': process.env.INTERNAL_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`📥 Order also added to user ${userId} via internal API`);
      } catch (apiErr) {
        console.error(`❌ Failed to sync with user DB:`, apiErr.response?.data || apiErr.message);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.sendStatus(500);
  }
};







const createOrderCOD = async (req, res) => {
  try {
    const { cart, customer, user_id } = req.body;

    // Input validation for basic request body structure
    if (!Array.isArray(cart) || cart.length === 0 || !customer || !customer.pincode) {
      return res.status(400).json({ error: 'Missing cart, customer, or customer pincode in request.' });
    }

    const pincode = customer.pincode;
    // Extract product IDs from the incoming cart
    const productIds = cart.map(item => item.productId);

    // 1. Fetch products available for this pincode by their IDs
    let productsData = [];
    try {
      const productRes = await axios.post(
        'https://productsdata-lj4d.onrender.com/api/products/by-ids',
        { productIds, pincode }, // Send productIds and pincode in the request body
        { headers: { 'Content-Type': 'application/json' } }
      );
      productsData = productRes.data;
    } catch (fetchErr) {
      console.error(`❌ Error fetching products by IDs for pincode ${pincode}:`, fetchErr.response?.data || fetchErr.message);
      return res.status(500).json({ error: 'Failed to fetch product data. Please try again later.' });
    }

    // Check if productsData is an array and not empty after fetching
    // Important: productsData should contain *only* the products found for the given IDs and pincode.
    // If some requested IDs are not returned, it means they are not available.
    if (!Array.isArray(productsData) || productsData.length === 0) {
        // This could mean no products are available for the given IDs and pincode
        return res.status(404).json({ error: 'No products found for the items in your cart at the specified pincode.' });
    }

    // 2. Validate cart and calculate subtotals
    // We now iterate through the original cart and match with fetched productsData
    const validatedCart = cart.map(item => {
      const matchedProduct = productsData.find(p => p._id === item.productId);

      if (!matchedProduct) {
        // This means a product in the user's cart was not returned by the /by-ids API,
        // implying it's either invalid, unavailable, or not for this pincode.
        throw new Error(`Product not available for pincode ${pincode} or invalid: ${item.productId}`);
      }

      // *** CRITICAL ASSUMPTION: Your product data from /by-ids MUST include a price field.
      // Based on your previous example, it did not. This needs to be fixed on the API side.
      // I'll continue to use 'discounted_price' as you did, but it needs to exist in the response.
      if (matchedProduct.discounted_price === undefined || matchedProduct.discounted_price === null) {
          throw new Error(`Product ${item.productId} (name: ${matchedProduct.name}) is missing 'discounted_price' from the API response.`);
      }

      const productPrice = parseFloat(matchedProduct.discounted_price);

      if (isNaN(productPrice) || productPrice < 0) {
          throw new Error(`Invalid price for product ${item.productId} (name: ${matchedProduct.name}). Price: ${matchedProduct.discounted_price}`);
      }
    if (item.quantity <= 0 || isNaN(item.quantity)) { // Check for non-positive or non-numeric
    throw new Error(`Invalid quantity for product ${item.productId}. Quantity: ${item.quantity}`);
}
// You might want to add a check for minimum quantity, e.g., if (item.quantity < 0.1)

      return {
        productId: matchedProduct._id,
        name: matchedProduct.name,
        price: productPrice, // Store the valid parsed price here
        quantity: item.quantity,
        subtotal: productPrice * item.quantity,
      };
    });

    // 3. Calculate total amount
    const totalAmount = validatedCart.reduce((sum, item) => sum + item.subtotal, 0);

    // Order amount validation
    if (totalAmount < 10) {
      return res.status(400).json({ error: 'Minimum order amount for COD is ₹10.' });
    } else if (totalAmount > 100) {
      return res.status(400).json({ error: 'COD supports orders under ₹100 only.' });
    }

    const orderId = 'COD_' + Date.now();

    // 4. Save order as COD
    const newOrder = new Order({
      orderId,
      cart: validatedCart.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price, // Use item.price from validatedCart (already parsed and validated)
        quantity: item.quantity,
      })),
      user_id,
      customer,
      totalAmount,
      paymentSessionId: null,
      paymentStatus: 'not paid', // COD orders are "not paid" until physically collected
      paymentMode: 'COD',
      paymentMethod: 'cod',
      orderStatus: 'confirmed', // Initial status
      deliveryStatus: 'pending',
      // Assuming createdAt and updatedAt are handled by Mongoose timestamps
    });

    await newOrder.save();
    console.log(`✅ COD Order ${newOrder.orderId} saved to database.`);

    // 5. Optionally sync with user database
    if (user_id && process.env.INTERNAL_API_KEY) {
      const orderPayload = {
        order: {
          orderId: newOrder.orderId,
          orderStatus: newOrder.orderStatus,
          paymentStatus: newOrder.paymentStatus,
          paymentMethod: 'cod',
          deliveryStatus: newOrder.deliveryStatus,
          returnStatus: 'none', // Default
          items: newOrder.cart.map(item => ({
            itemId: item.productId,
            itemName: item.name,
            quantity: item.quantity,
            price: item.price, // Use item.price from newOrder.cart
          })),
          totalPrice: newOrder.totalAmount,
          orderDate: newOrder.createdAt,
        },
      };

      try {
        await axios.post(
          `https://authenatation.onrender.com/api/users/${user_id}/orders`,
          orderPayload,
          {
            headers: {
              'x-internal-api-key': process.env.INTERNAL_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`📥 COD Order also synced to user ${user_id} in product data service.`);
      } catch (apiErr) {
        console.error(`❌ Failed to sync COD order to user DB:`, apiErr.response?.data || apiErr.message);
        // Do not return res.status(500) here, as the order was already successfully placed.
        // This is an external sync issue, not a core order placement failure.
      }
    }

    // Success response
    return res.json({
      message: 'COD order placed successfully',
      order_id: orderId,
      total_amount: totalAmount // Optionally return total amount for client confirmation
    });

  } catch (err) {
    console.error('❌ Create COD Order Error:', err.message); // Log full error message

    // More granular error handling
    if (err.message.includes('Product not available for pincode') || err.message.includes('missing \'discounted_price\'') || err.message.includes('Invalid price for product') || err.message.includes('Invalid quantity')) {
        return res.status(400).json({
            error: err.message, // Return the specific error message to client
            details: 'Please check your cart items and ensure all products are available and have valid pricing.'
        });
    }

    // Generic server error
    return res.status(500).json({
      error: 'Failed to create COD order due to an internal server error.',
      details: err.message, // Provide error message for debugging
    });
  }
};

module.exports = {
  createOrder,
  getPaymentStatus,
  cashfreeWebhook,
  createOrderCOD // 👈 Export the new handler
};











