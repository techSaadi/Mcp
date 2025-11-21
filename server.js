require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MCP_SECRET_KEY = process.env.MCP_SECRET_KEY || "poke_whatsapp_clickup_2024";
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;

console.log('🚀 Starting Poke MCP Server with REAL WhatsApp...');

// ==================== REAL WHATSAPP CLIENT ====================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isWhatsAppReady = false;
const pendingMessages = [];

// WhatsApp QR Code
whatsappClient.on('qr', (qr) => {
    console.log('\n📱 WHATSAPP QR CODE - Scan with your phone:');
    qrcode.generate(qr, { small: true });
    console.log('\n1. Open WhatsApp on your phone');
    console.log('2. Go to Settings → Linked Devices → Link a Device');
    console.log('3. Scan the QR code above\n');
});

// WhatsApp Ready
whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp CLIENT READY! You can now send and receive messages.');
    isWhatsAppReady = true;
    
    // Process any pending messages
    pendingMessages.forEach(msg => {
        sendRealWhatsAppMessage(msg.phoneNumber, msg.message);
    });
    pendingMessages.length = 0;
});

// WhatsApp Message Received
whatsappClient.on('message', async (message) => {
    console.log('\n📩 NEW WHATSAPP MESSAGE RECEIVED:');
    console.log('From:', message.from);
    console.log('Message:', message.body);
    console.log('Timestamp:', message.timestamp);
    
    // You can process messages here
    // Forward to Poke, save to database, etc.
});

whatsappClient.initialize();

// ==================== REAL WHATSAPP FUNCTIONS ====================
async function sendRealWhatsAppMessage(phoneNumber, message) {
    try {
        if (!isWhatsAppReady) {
            console.log('⏳ WhatsApp not ready, message queued...');
            pendingMessages.push({ phoneNumber, message });
            return {
                success: false,
                error: 'WhatsApp connecting... Please wait',
                queued: true
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
        
        console.log('✅ REAL WhatsApp Message Sent!');
        
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

// ==================== CLICKUP FUNCTIONS ====================
async function createClickUpTask(taskName, description = '') {
    try {
        console.log('📤 Creating ClickUp Task:', taskName);
        
        // Get teams to find correct list
        const teamsResponse = await axios.get('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        if (!teamsResponse.data.teams || teamsResponse.data.teams.length === 0) {
            return {
                success: false,
                error: 'No ClickUp teams found. Please check your API key.'
            };
        }

        const teamId = teamsResponse.data.teams[0].id;
        console.log('✅ Team Found:', teamId);

        // Get spaces
        const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        if (!spacesResponse.data.spaces || spacesResponse.data.spaces.length === 0) {
            return {
                success: false,
                error: 'No spaces found in your team.'
            };
        }

        const spaceId = spacesResponse.data.spaces[0].id;
        console.log('✅ Space Found:', spaceId);

        // Get lists
        const listsResponse = await axios.get(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
            headers: { 'Authorization': CLICKUP_API_KEY }
        });

        if (!listsResponse.data.lists || listsResponse.data.lists.length === 0) {
            return {
                success: false,
                error: 'No lists found. Please create a list in your ClickUp space.'
            };
        }

        const listId = listsResponse.data.lists[0].id;
        console.log('✅ List Found:', listId);

        // Create task
        const taskResponse = await axios.post(
            `https://api.clickup.com/api/v2/list/${listId}/task`,
            {
                name: taskName,
                description: description
            },
            {
                headers: {
                    'Authorization': CLICKUP_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ ClickUp Task Created:', taskResponse.data.id);
        
        return {
            success: true,
            taskId: taskResponse.data.id,
            taskName: taskResponse.data.name,
            taskUrl: taskResponse.data.url,
            message: `Task "${taskName}" created successfully in ClickUp!`
        };
    } catch (error) {
        console.error('❌ ClickUp Error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.err || error.message || 'Failed to create task'
        };
    }
}

// ==================== MCP AUTHENTICATION ====================
const authenticateMCP = (req, res, next) => {
    const clientKey = req.headers['x-mcp-key'];
    
    if (!clientKey) {
        return res.status(401).json({
            success: false,
            error: 'MCP key is required in x-mcp-key header'
        });
    }
    
    if (clientKey !== MCP_SECRET_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Invalid MCP key'
        });
    }
    
    next();
};

// ==================== MCP TOOLS ENDPOINT ====================
app.post('/mcp/run', authenticateMCP, async (req, res) => {
    try {
        const { tool_name, parameters } = req.body;
        
        console.log('\n🛠️ MCP Tool Called:', tool_name);
        console.log('📝 Parameters:', parameters);

        // Tool: create_clickup_task
        if (tool_name === 'create_clickup_task') {
            const { task_name, description = '' } = parameters;
            
            if (!task_name) {
                return res.json({
                    success: false,
                    error: 'Task name (task_name) is required'
                });
            }

            const result = await createClickUpTask(task_name, description);
            res.json(result);
        }
        
        // Tool: send_whatsapp_message
        else if (tool_name === 'send_whatsapp_message') {
            const { phone_number, message } = parameters;
            
            if (!phone_number) {
                return res.json({
                    success: false,
                    error: 'Phone number (phone_number) is required'
                });
            }
            
            if (!message) {
                return res.json({
                    success: false,
                    error: 'Message content (message) is required'
                });
            }

            const result = await sendRealWhatsAppMessage(phone_number, message);
            res.json(result);
        }
        
        // Tool: get_server_status
        else if (tool_name === 'get_server_status') {
            res.json({
                success: true,
                status: 'running',
                services: {
                    clickup: CLICKUP_API_KEY ? 'configured' : 'not_configured',
                    whatsapp: isWhatsAppReady ? 'connected' : 'connecting',
                    server: 'healthy'
                },
                timestamp: new Date().toISOString()
            });
        }
        
        // Tool: get_whatsapp_qr
        else if (tool_name === 'get_whatsapp_qr') {
            res.json({
                success: true,
                whatsapp_status: isWhatsAppReady ? 'connected' : 'waiting_qr',
                message: isWhatsAppReady ? 'WhatsApp is connected' : 'Please scan QR code to connect WhatsApp'
            });
        }
        
        // Unknown tool
        else {
            res.json({
                success: false,
                error: `Unknown tool: ${tool_name}. Available tools: create_clickup_task, send_whatsapp_message, get_server_status, get_whatsapp_qr`
            });
        }
        
    } catch (error) {
        console.error('❌ MCP Endpoint Error:', error);
        res.json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
});

// ==================== HEALTH CHECK ENDPOINT ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Poke MCP Server',
        version: '1.0.0',
        whatsapp: isWhatsAppReady ? 'connected' : 'disconnected',
        clickup: CLICKUP_API_KEY ? 'configured' : 'not_configured',
        timestamp: new Date().toISOString(),
        endpoints: {
            mcp: '/mcp/run',
            health: '/health'
        }
    });
});

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Poke MCP Server is Running!',
        services: ['WhatsApp Messaging', 'ClickUp Task Management'],
        endpoints: {
            mcp: 'POST /mcp/run',
            health: 'GET /health'
        },
        instructions: 'Connect this server to Poke AI via MCP protocol'
    });
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 POKE MCP SERVER STARTED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`📍 Server URL: http://localhost:${PORT}`);
    console.log(`📍 Cloud URL: https://your-app.up.railway.app`);
    console.log(`🛠️  MCP Endpoint: /mcp/run`);
    console.log(`❤️  Health Check: /health`);
    console.log(`🔑 MCP Key: ${MCP_SECRET_KEY}`);
    console.log('='.repeat(60));
    console.log('\n📋 Available Tools:');
    console.log('   • create_clickup_task - Create tasks in ClickUp');
    console.log('   • send_whatsapp_message - Send WhatsApp messages');
    console.log('   • get_server_status - Check server health');
    console.log('   • get_whatsapp_qr - WhatsApp connection status');
    console.log('\n🚀 Server ready for Poke integration!');
    console.log('📱 WhatsApp QR code will appear when server starts...');
});