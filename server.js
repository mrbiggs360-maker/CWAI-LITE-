const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for large story files

// The Universal Backup Folder
const backupDir = path.join(__dirname, 'CWAIUBackup');
const stateFile = path.join(backupDir, 'universal_state.json');
const keysFile = path.join(backupDir, 'secure_keys.json');

// Initialize Folder Structure
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log('📁 CWAIUBackup folder spawned successfully!');
} else {
    console.log('✅ CWAIUBackup folder detected. Ready for universal sync.');
}

// Helper: Detect Provider (Moved from Frontend)
function detectProvider(key, autoDetect) { 
    if(!autoDetect) return 'openrouter'; 
    if(key.startsWith('AIza')) return 'google'; 
    if(key.startsWith('sk-or-')) return 'openrouter'; 
    if(key.startsWith('sk-')) return 'deepseek'; 
    return 'openrouter'; 
}

// ENDPOINT: Securely store API keys
app.post('/api/set-keys', (req, res) => {
    try {
        fs.writeFileSync(keysFile, JSON.stringify(req.body, null, 2));
        res.json({ message: "Keys secured in Node." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ENDPOINT: Universal Backup
app.post('/api/backup', (req, res) => {
    try {
        fs.writeFileSync(stateFile, JSON.stringify(req.body, null, 2));
        res.json({ message: "Data backed up to CWAIUBackup." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ENDPOINT: Universal Restore
app.get('/api/restore', (req, res) => {
    try {
        if (fs.existsSync(stateFile)) {
            const data = fs.readFileSync(stateFile, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: "No universal backup found." });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ENDPOINT: Chat Proxy (Handles API securely)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, temperature } = req.body;
        let keys = {};
        
        if (fs.existsSync(keysFile)) {
            keys = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
        }
        
        if (!keys.primary) {
            return res.status(400).json({ error: "No API keys secured in backend. Please update your settings." });
        }

        const tryCall = async (key) => {
            const prov = detectProvider(key, keys.autoDetect);
            let url, body, headers;
            
            let baseEndpoint = keys.endpoint;
            if(!baseEndpoint) {
                baseEndpoint = prov === 'google' 
                    ? "https://generativelanguage.googleapis.com/v1beta/models" 
                    : (prov === 'openrouter' ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.deepseek.com/chat/completions");
            }

            if(prov === 'google') {
                const contents = messages.filter(m=>m.role!=='system').map(m=>({ role: m.role==='assistant'?'model':'user', parts: [{text: m.content}] }));
                const sys = messages.find(m=>m.role==='system')?.content;
                if(sys && contents.length) contents[0].parts[0].text = "System: "+sys+"\n\n"+contents[0].parts[0].text;
                
                let mName = keys.targetModel.includes('/') ? keys.targetModel.split('/')[1] : (keys.targetModel || "gemini-2.0-flash-lite-preview-02-05");
                
                if (baseEndpoint.includes(':generateContent')) url = `${baseEndpoint}?key=${key}`;
                else url = `${baseEndpoint}/${mName}:generateContent?key=${key}`;

                body = JSON.stringify({ contents }); headers = {'Content-Type': 'application/json'};
            } else {
                url = baseEndpoint; 
                headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
                if(prov === 'openrouter') { headers['HTTP-Referer'] = 'http://localhost:3000'; headers['X-Title'] = 'CWAI Node Sync'; }
                body = JSON.stringify({ model: keys.targetModel || 'gpt-3.5-turbo', messages, temperature });
            }
            
            const fetchRes = await fetch(url, { method: 'POST', headers, body });
            const d = await fetchRes.json();
            if(!fetchRes.ok || d.error) throw new Error(d.error?.message || "API Error");
            return prov === 'google' ? d.candidates[0].content.parts[0].text : d.choices[0].message.content;
        };

        try {
            const reply = await tryCall(keys.primary);
            res.json({ reply });
        } catch(e) {
            if(keys.backup) {
                console.log("Primary failed, trying backup...");
                const reply = await tryCall(keys.backup);
                res.json({ reply });
            } else {
                throw e;
            }
        }
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`CWAI Backend active on http://localhost:${PORT}`));
