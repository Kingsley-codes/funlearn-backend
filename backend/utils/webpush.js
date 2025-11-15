import webpush from 'web-push';

webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Send push when a new message comes in
export const sendPushNotification = async (subscription, payload) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
        console.error('Push error:', err);

        // If subscription is expired/invalid, you might want to remove it
        if (err.statusCode === 410) {
            console.log('Subscription expired and should be removed');
            // Add logic to remove expired subscription from database
        }
    }
};
