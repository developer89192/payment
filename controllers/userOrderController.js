const getUserModel = require('../models/userOrderModel');

/**
 * Adds a new order to a user's order history.
 * @param {string} userId - The ID of the user to update.
 * @param {object} orderData - The order data to be added.
 * @returns {Promise<object>} The updated user document.
 */
const addOrderToUser = async (userId, orderData) => {
    try {
        const User = await getUserModel();

        const orderToAdd = {
            orderId: String(orderData?.orderId || ''),
            orderStatus: String(orderData?.orderStatus || 'placed'),
            paymentStatus: String(orderData?.paymentStatus || 'not_paid'),
            paymentMethod: String(orderData?.paymentMethod || ''),
            deliveryMethod: String(orderData?.deliveryMethod || 'standard'),
            returnStatus: String(orderData?.returnStatus || 'none'),
            items: (orderData?.items || []).map(item => ({
                itemId: String(item.itemId || ''),
                itemName: String(item.itemName || ''),
                imageUrl: String(item.imageUrl || 'https://placehold.co/100x100/E0E0E0/000000?text=No+Image'),
                quantity: Number(item.quantity || 0),
                price: Number(item.price || 0),
                quantity_type: String(item.quantity_type || ''),
                quantity_label: String(item.quantity_label || '')
            })),
            totalPrice: Number(orderData?.totalPrice || 0),
            charges: orderData?.charges || {},
            finalAmount: Number(orderData?.finalAmount || 0),

            // Store delivery details from the main order
            deliveryDetails: {
                orderDate: orderData?.orderDate ? new Date(orderData.orderDate) : new Date(),
                expectedDeliveryDate: orderData?.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate) : undefined,
                timing: orderData?.selectedDeliverySlot || {}, // Store the entire slot object
            },

            address: {
                name: String(orderData?.address?.name || ''),
                apartment: String(orderData?.address?.apartment || ''),
                street: String(orderData?.address?.street || ''),
                type: String(orderData?.address?.type || ''),
                lat: orderData?.address?.lat ? Number(orderData.address.lat) : undefined,
                lon: orderData?.address?.lon ? Number(orderData.address.lon) : undefined,
                pincode: String(orderData?.address?.pincode || ''),
                address: String(orderData?.address?.address || '')
            }
        };

        // Remove properties with `undefined` values.
        const cleanObject = (obj) => {
            if (!obj) return;
            Object.keys(obj).forEach(key => {
                if (obj[key] === undefined) {
                    delete obj[key];
                }
            });
            return obj;
        };

        orderToAdd.address = cleanObject(orderToAdd.address);
        orderToAdd.deliveryDetails = cleanObject(orderToAdd.deliveryDetails);

        console.log('📦 Order data to be added to user:', JSON.stringify(orderToAdd, null, 2));

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $push: { orders: orderToAdd } },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            console.error(`❌ User with ID ${userId} not found or failed to update.`);
            throw new Error(`User with ID ${userId} not found or failed to update`);
        }

        console.log(`✅ Order ${orderToAdd.orderId} added to user ${userId}`);
        return updatedUser;
    } catch (err) {
        console.error('❌ Error syncing order to user DB:', err.message);
        throw err;
    }
};

module.exports = {
    addOrderToUser,
};