require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const MCP_SECRET_KEY = "poke_whatsapp_clickup_2024";

console.log('🚀 Starting LOCAL WhatsApp Server...');

// FIXED WhatsApp Client Configuration
const whatsappClient = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-poke-client"
    }),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        executablePath: null // Use system Chrome
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

let isWhatsAppReady = false;
let qrCodeString = '';

// WhatsApp QR Code
whatsappClient.on('qr', (qr) => {
    console.log('\n' + '='.repeat(50));
    console.log('📱 WHATSAPP QR CODE - Scan with your phone:');
    console.log('='.repeat(50));
    qrcode.generate(qr, { small: true });
    qrCodeString = qr;
    console.log('\n💡 Instructions:');
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Settings → Linked Devices → Link a Device');
    console.log('3. Scan the QR code above');
    console.log('4. Wait for "✅ WhatsApp CLIENT READY!" message');
    console.log('='.repeat(50) + '\n');
});

// WhatsApp Ready
whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp CLIENT READY! Real messages bhej sakte hain.');
    isWhatsAppReady = true;
    qrCodeString = ''; // Clear QR after connection
});

// WhatsApp Authentication Failure
whatsappClient.on('auth_failure', (msg) => {
    console.log('❌ WhatsApp Authentication failed:', msg);
    isWhatsAppReady = false;
});

// WhatsApp Disconnected
whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnected:', reason);
    isWhatsAppReady = false;
    console.log('🔄 Reconnecting...');
    setTimeout(() => {
        whatsappClient.initialize();
    }, 5000);
});

// Initialize WhatsApp with error handling
async function initializeWhatsApp() {
    try {
        await whatsappClient.initialize();
        console.log('🔄 WhatsApp client initializing...');
    } catch (error) {
        console.error('❌ Failed to initialize WhatsApp:', error);
        console.log('🔄 Retrying in 10 seconds...');
        setTimeout(initializeWhatsApp, 10000);
    }
}

initializeWhatsApp();

// REAL WhatsApp Function
async function sendRealWhatsAppMessage(phoneNumber, message) {
    try {
        if (!isWhatsAppReady) {
            return {
                success: false,
                error: 'WhatsApp connecting... Please scan QR code first and wait for ready message.',
                qr_required: true
            };
        }

        // Format phone number
        let cleanedNumber = phoneNumber.replace(/\s+/g, '').replace(/[+-\s]/g, '');
        if (!cleanedNumber.startsWith('92') && cleanedNumber.length === 10) {
            cleanedNumber = '92' + cleanedNumber;
        }
        
        const chatId = `${cleanedNumber}@c.us`;
        
        console.log(`📤 SENDING REAL WhatsApp to: ${cleanedNumber}`);
        console.log(`💬 Message: ${message}`);
        
        const sentMessage = await whatsappClient.sendMessage(chatId, message);
        
        console.log('✅ REAL WhatsApp Message Sent Successfully!');
        
        return {
            success: true,
            messageId: sentMessage.id._serialized,
            to: cleanedNumber,
            timestamp: sentMessage.timestamp,
            message: `REAL WhatsApp sent to ${cleanedNumber} successfully!`
        };
    } catch (error) {
        console.error('❌ WhatsApp Send Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// MCP Endpoint for WhatsApp
app.post('/mcp/run', async (req, res) => {
    try {
        const clientKey = req.headers['x-mcp-key'];
        if (!clientKey || clientKey !== MCP_SECRET_KEY) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid MCP key' 
            });
        }

        const { tool_name, parameters } = req.body;
        
        console.log('🛠️ WhatsApp Tool Called:', tool_name);

        if (tool_name === 'send_whatsapp_message') {
            const { phone_number, message } = parameters;
            
            if (!phone_number || !message) {
                return res.json({
                    success: false,
                    error: 'Phone number and message are required'
                });
            }

            const result = await sendRealWhatsAppMessage(phone_number, message);
            res.json(result);
        }
        else if (tool_name === 'get_whatsapp_status') {
            res.json({
                success: true,
                whatsapp_ready: isWhatsAppReady,
                qr_required: !isWhatsAppReady && !!qrCodeString,
                message: isWhatsAppReady ? 'WhatsApp connected and ready' : 
                         qrCodeString ? 'Please scan QR code to connect WhatsApp' : 
                         'WhatsApp initializing...'
            });
        }
        else if (tool_name === 'get_whatsapp_qr') {
            res.json({
                success: true,
                qr_available: !!qrCodeString,
                whatsapp_ready: isWhatsAppReady,
                message: isWhatsAppReady ? 'WhatsApp already connected' : 
                         qrCodeString ? 'QR code available - scan to connect' :
                         'Generating QR code...'
            });
        }
        else {
            res.json({ 
                success: false, 
                error: `Unknown tool: ${tool_name}` 
            });
        }
    } catch (error) {
        console.error('❌ WhatsApp Server Error:', error);
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Local WhatsApp Server',
        whatsapp_ready: isWhatsAppReady,
        qr_available: !!qrCodeString,
        timestamp: new Date().toISOString()
    });
});

// Get QR Code (for manual checking)
app.get('/qr', (req, res) => {
    if (qrCodeString) {
        res.json({
            qr_available: true,
            message: 'Scan this QR code with WhatsApp'
        });
    } else if (isWhatsAppReady) {
        res.json({
            qr_available: false,
            message: 'WhatsApp already connected'
        });
    } else {
        res.json({
            qr_available: false,
            message: 'QR code not generated yet'
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 LOCAL WHATSAPP SERVER STARTED!');
    console.log('='.repeat(60));
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`🛠️  MCP Endpoint: /mcp/run`);
    console.log(`❤️  Health Check: /health`);
    console.log(`📱 QR Check: /qr`);
    console.log(`🔑 MCP Key: ${MCP_SECRET_KEY}`);
    console.log('='.repeat(60));
    console.log('\n📋 Available Tools:');
    console.log('   • send_whatsapp_message - REAL WhatsApp messages');
    console.log('   • get_whatsapp_status - Check WhatsApp connection');
    console.log('   • get_whatsapp_qr - Get QR code status');
    console.log('\n📱 Waiting for WhatsApp QR code...');
});