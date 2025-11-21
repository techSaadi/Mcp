require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// CORS configuration for Vercel
app.use(cors({
  origin: [
    'https://poke.com',
    'https://*.poke.com',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
}));

app.use(express.json());

const MCP_SECRET_KEY = process.env.MCP_SECRET_KEY || "poke_whatsapp_clickup_2024";
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL;

console.log('🚀 Starting Vercel MCP Server...');

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
            error: 'Invalid MCP key. Use: poke_whatsapp_clickup_2024'
        });
    }
    
    next();
};

// ==================== CLICKUP FUNCTIONS ====================
async function createClickUpTask(taskName, description = '') {
    try {
        console.log('📤 Creating ClickUp Task:', taskName);
        
        if (!CLICKUP_API_KEY) {
            return {
                success: false,
                error: 'ClickUp API key not configured in environment variables'
            };
        }

        // Get teams
        const teamsResponse = await axios.get('https://api.clickup.com/api/v2/team', {
            headers: { 'Authorization': CLICKUP_API_KEY },
            timeout: 10000
        });

        if (!teamsResponse.data.teams || teamsResponse.data.teams.length === 0) {
            return {
                success: false,
                error: 'No ClickUp teams found. Please check your API key.'
            };
        }

        const teamId = teamsResponse.data.teams[0].id;
        
        // Get spaces
        const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
            headers: { 'Authorization': CLICKUP_API_KEY },
            timeout: 10000
        });

        if (!spacesResponse.data.spaces || spacesResponse.data.spaces.length === 0) {
            return {
                success: false,
                error: 'No spaces found in your ClickUp team.'
            };
        }

        const spaceId = spacesResponse.data.spaces[0].id;
        
        // Get lists
        const listsResponse = await axios.get(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
            headers: { 'Authorization': CLICKUP_API_KEY },
            timeout: 10000
        });

        if (!listsResponse.data.lists || listsResponse.data.lists.length === 0) {
            return {
                success: false,
                error: 'No lists found. Please create a list in your ClickUp space.'
            };
        }

        const listId = listsResponse.data.lists[0].id;

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
                },
                timeout: 15000
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
            error: error.response?.data?.err || error.message || 'Failed to create task in ClickUp'
        };
    }
}

// ==================== WHATSAPP PROXY FUNCTIONS ====================
async function sendWhatsAppMessage(phoneNumber, message) {
    try {
        if (!WHATSAPP_SERVER_URL) {
            return {
                success: false,
                error: 'WhatsApp server not configured. Please set WHATSAPP_SERVER_URL environment variable.'
            };
        }

        console.log(`📤 Forwarding WhatsApp to: ${phoneNumber}`);
        
        const response = await axios.post(
            `${WHATSAPP_SERVER_URL}/mcp/run`,
            {
                tool_name: 'send_whatsapp_message',
                parameters: {
                    phone_number: phoneNumber,
                    message: message
                }
            },
            {
                headers: {
                    'x-mcp-key': MCP_SECRET_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 20000 // 20 seconds for WhatsApp
            }
        );

        console.log('✅ WhatsApp forwarded successfully');
        return response.data;
    } catch (error) {
        console.error('❌ WhatsApp Proxy Error:', error.message);
        return {
            success: false,
            error: 'WhatsApp server unavailable. Please ensure local WhatsApp server is running.'
        };
    }
}

// Check WhatsApp server status
async function checkWhatsAppStatus() {
    try {
        if (!WHATSAPP_SERVER_URL) {
            return {
                connected: false,
                message: 'WhatsApp server URL not configured'
            };
        }

        const response = await axios.get(`${WHATSAPP_SERVER_URL}/health`, { 
            timeout: 5000 
        });
        
        return {
            connected: true,
            ready: response.data.whatsapp_ready,
            message: response.data.whatsapp_ready ? 'WhatsApp connected and ready' : 'WhatsApp server running but not connected'
        };
    } catch (error) {
        return {
            connected: false,
            message: 'WhatsApp server not reachable'
        };
    }
}

// ==================== MCP TOOLS ENDPOINT ====================
app.post('/mcp/run', authenticateMCP, async (req, res) => {
    try {
        const { tool_name, parameters } = req.body;
        
        console.log('\n🛠️ MCP Tool Called:', tool_name);
        console.log('📝 Parameters:', parameters);

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

            const result = await sendWhatsAppMessage(phone_number, message);
            res.json(result);
        }
        else if (tool_name === 'get_server_status') {
            const whatsappStatus = await checkWhatsAppStatus();
            
            res.json({
                success: true,
                status: 'running',
                deployment: 'vercel',
                services: {
                    clickup: CLICKUP_API_KEY ? 'configured' : 'not_configured',
                    whatsapp: whatsappStatus.connected ? (whatsappStatus.ready ? 'connected' : 'waiting_qr') : 'disconnected',
                    server: 'healthy'
                },
                message: whatsappStatus.message,
                timestamp: new Date().toISOString()
            });
        }
        else {
            res.json({
                success: false,
                error: `Unknown tool: ${tool_name}. Available tools: create_clickup_task, send_whatsapp_message, get_server_status`
            });
        }
    } catch (error) {
        console.error('❌ MCP Error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Vercel MCP Server',
        version: '2.0.0',
        deployment: 'vercel',
        features: ['ClickUp Integration', 'WhatsApp Integration'],
        timestamp: new Date().toISOString(),
        endpoints: {
            mcp: 'POST /api/mcp/run',
            health: 'GET /api/health'
        }
    });
});

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Poke MCP Server deployed on Vercel',
        services: ['ClickUp Task Management', 'WhatsApp Messaging'],
        deployment: 'vercel',
        instructions: 'Use /api/mcp/run endpoint for Poke integration'
    });
});

// ==================== VERCEL COMPATIBILITY ====================
// Export for Vercel serverless functions
module.exports = app;

// For local development
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}