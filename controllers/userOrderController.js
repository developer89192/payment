const getUserModel = require('../models/userOrderModel');

const addOrderToUser = async (userId, orderData) => {
  try {
    const User = await getUserModel();
    
    // ✅ Validate that the user exists first
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // ✅ Create a clean order object with explicit type conversion
    const orderToAdd = {
      orderId: String(orderData.orderId),
      orderStatus: String(orderData.orderStatus || ''),
      paymentStatus: String(orderData.paymentStatus || ''),
      paymentMethod: String(orderData.paymentMethod || ''),
      deliveryStatus: String(orderData.deliveryStatus || ''),
      returnStatus: String(orderData.returnStatus || 'none'),
      items: (orderData.items || []).map(item => ({
        itemId: String(item.itemId || ''),
        itemName: String(item.itemName || ''),
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0)
      })),
      totalPrice: Number(orderData.totalPrice || 0),
      orderDate: orderData.orderDate ? new Date(orderData.orderDate) : new Date(),
      address: {
        name: String(orderData.address?.name || ''),
        apartment: String(orderData.address?.apartment || ''),
        street: String(orderData.address?.street || ''),
        type: String(orderData.address?.type || ''),
        lat: orderData.address?.lat ? Number(orderData.address.lat) : undefined,
        lon: orderData.address?.lon ? Number(orderData.address.lon) : undefined,
        pincode: String(orderData.address?.pincode || ''),
        address: String(orderData.address?.address || '')
      }
    };

    // ✅ Remove undefined values from address
    Object.keys(orderToAdd.address).forEach(key => {
      if (orderToAdd.address[key] === undefined) {
        delete orderToAdd.address[key];
      }
    });

    console.log('📦 Order data to be added:', JSON.stringify(orderToAdd, null, 2));

    // Add to orders array
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { orders: orderToAdd } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw new Error(`Failed to update user ${userId} with order`);
    }

    console.log(`✅ Order ${orderData.orderId} added to user ${userId}`);
    return updatedUser;
  } catch (err) {
    console.error('❌ Error syncing order to user DB:', err.message);
    console.error('❌ Full error:', err);
    throw err;
  }
};

module.exports = {
  addOrderToUser,
};
