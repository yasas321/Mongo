const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥';

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['🔥', '😀', '👍', '😃', '😄', '😁', '😎', '🥳', '🌞', '🌈', '❤️'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/L6AbGyOmgqU4kse6IwPL3S?mode=wwt',
    RCD_IMAGE_PATH: 'https://files.catbox.moe/m9wpbi.jpg',
    NEWSLETTER_JID: '120363402716908892@newsletter',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: process.env.OWNER_NUMBER || '94785316830',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbB8UoBHrDZd364h8b34',
    BOT_NAME: '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥',
    BOT_VERSION: '1.0.0V',
    OWNER_NAME: 'Yasas Dileepa',
    IMAGE_PATH: 'https://files.catbox.moe/m9wpbi.jpg',
    BOT_FOOTER: '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥',
    BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/m9wpbi.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://botmini:botmini@minibot.upglk0f.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'DILI_MINI_TEDT';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
    try {
        if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
    } catch (e) {}
    mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongoClient.connect();
    mongoDB = mongoClient.db(MONGO_DB);

    sessionsCol = mongoDB.collection('sessions');
    numbersCol = mongoDB.collection('numbers');
    adminsCol = mongoDB.collection('admins');
    newsletterCol = mongoDB.collection('newsletter_list');
    configsCol = mongoDB.collection('configs');
    newsletterReactsCol = mongoDB.collection('newsletter_reacts');

    await sessionsCol.createIndex({ number: 1 }, { unique: true });
    await numbersCol.createIndex({ number: 1 }, { unique: true });
    await newsletterCol.createIndex({ jid: 1 }, { unique: true });
    await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
    await configsCol.createIndex({ number: 1 }, { unique: true });
    console.log('✅ Mongo initialized and collections ready');
}

// ---------------- MONGO HELPERS ----------------

async function saveCredsToMongo(number, creds, keys = null) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
        await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
        console.log(`Saved creds to Mongo for ${sanitized}`);
    } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = await sessionsCol.findOne({ number: sanitized });
        return doc || null;
    } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await sessionsCol.deleteOne({ number: sanitized });
        console.log(`Removed session from Mongo for ${sanitized}`);
    } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
        console.log(`Added number ${sanitized} to Mongo numbers`);
    } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await numbersCol.deleteOne({ number: sanitized });
        console.log(`Removed number ${sanitized} from Mongo numbers`);
    } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
    try {
        await initMongo();
        const docs = await numbersCol.find({}).toArray();
        return docs.map(d => d.number);
    } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
    try {
        await initMongo();
        const docs = await adminsCol.find({}).toArray();
        return docs.map(d => d.jid || d.number).filter(Boolean);
    } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
    try {
        await initMongo();
        const doc = { jid: jidOrNumber };
        await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
        console.log(`Added admin ${jidOrNumber}`);
    } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
    try {
        await initMongo();
        await adminsCol.deleteOne({ jid: jidOrNumber });
        console.log(`Removed admin ${jidOrNumber}`);
    } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
    try {
        await initMongo();
        const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
        await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
        console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
    } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
    try {
        await initMongo();
        await newsletterCol.deleteOne({ jid });
        console.log(`Removed newsletter ${jid}`);
    } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
    try {
        await initMongo();
        const docs = await newsletterCol.find({}).toArray();
        return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
    } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
    try {
        await initMongo();
        const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
        if (!mongoDB) await initMongo();
        const col = mongoDB.collection('newsletter_reactions_log');
        await col.insertOne(doc);
        console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
    } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = await configsCol.findOne({ number: sanitized });
        return doc ? doc.config : null;
    } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

async function listNewsletterReactsFromMongo() {
    try {
        await initMongo();
        const docs = await newsletterReactsCol.find({}).toArray();
        return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
    } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

// ---------------- GENERAL UTILS ----------------

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();
global.interviewSessions = global.interviewSessions || new Map();

// ---------------- CORE HANDLERS (DEFINED BEFORE USE) ----------------

// 1. Status Handler (This was missing/not found in previous errors)
async function setupStatusHandlers(socket, sessionNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            // Load user-specific config from MongoDB
            let userEmojis = config.AUTO_LIKE_EMOJI || ['🔥', '❤️', '👍'];
            let autoViewStatus = config.AUTO_VIEW_STATUS || 'true';
            let autoLikeStatus = config.AUTO_LIKE_STATUS || 'true';
            let autoRecording = config.AUTO_RECORDING || 'false';

            // Mongo DB function check
            if (sessionNumber && typeof loadUserConfigFromMongo === 'function') {
                const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
                if (userConfig.AUTO_LIKE_EMOJI) userEmojis = userConfig.AUTO_LIKE_EMOJI;
                if (userConfig.AUTO_VIEW_STATUS) autoViewStatus = userConfig.AUTO_VIEW_STATUS;
                if (userConfig.AUTO_LIKE_STATUS) autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
                if (userConfig.AUTO_RECORDING) autoRecording = userConfig.AUTO_RECORDING;
            }

            // Auto Recording (Fake)
            if (autoRecording === 'true') {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            // Auto View Status
            if (autoViewStatus === 'true') {
                await socket.readMessages([message.key]);
            }

            // Auto Like Status
            if (autoLikeStatus === 'true') {
                const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                await socket.sendMessage(message.key.remoteJid, {
                    react: { text: randomEmoji, key: message.key }
                }, { statusJidList: [message.key.participant] });
            }

        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

// 2. Newsletter Handler
async function setupNewsletterHandlers(socket, sessionNumber) {
    const rrPointers = new Map();

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;
        const jid = message.key.remoteJid;

        try {
            const followedDocs = await listNewslettersFromMongo();
            const reactConfigs = await listNewsletterReactsFromMongo();
            const reactMap = new Map();
            for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

            const followedJids = followedDocs.map(d => d.jid);
            if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

            let emojis = reactMap.get(jid) || null;
            if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
                emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
            }
            if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

            let idx = rrPointers.get(jid) || 0;
            const emoji = emojis[idx % emojis.length];
            rrPointers.set(jid, (idx + 1) % emojis.length);

            const messageId = message.newsletterServerId || message.key.id;
            if (!messageId) return;

            if (typeof socket.newsletterReactMessage === 'function') {
                await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
            } else {
                await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
            }
            await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);

        } catch (error) {
            // Silent fail for newsletter errors
        }
    });
}

// 3. Call Rejection
async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: '*🔕 Auto call rejection enabled.*' });
            }
        } catch (err) { console.error('Call rejection error:', err); }
    });
}

// 4. Auto Message Read
async function setupAutoMessageRead(socket, sessionNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
        const userConfig = await loadUserConfigFromMongo(sanitized) || {};
        const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

        if (autoReadSetting === 'off') return;

        if (autoReadSetting === 'all') {
            try { await socket.readMessages([msg.key]); } catch (e) {}
        }
    });
}

// 5. Revoke Handler
async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;
        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const message = formatMessage('🗑️ MESSAGE DELETED', `From: ${messageKey.remoteJid}\nTime: ${getSriLankaTimestamp()}`, BOT_NAME_FANCY);
        try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); } catch (error) {}
    });
}

// 6. Auto Restart
function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            const isLoggedOut = statusCode === 401 || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
            if (isLoggedOut) {
                await deleteSessionAndCleanup(number, socket);
            } else {
                await delay(5000);
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

// 7. Clean Up
async function deleteSessionAndCleanup(number, socketInstance) {
    const sanitized = number.replace(/[^0-9]/g, '');
    try {
        const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) {}
        activeSockets.delete(sanitized);
        socketCreationTime.delete(sanitized);
        try { await removeSessionFromMongo(sanitized); } catch (e) {}
        try { await removeNumberFromMongo(sanitized); } catch (e) {}
        console.log(`Cleanup completed for ${sanitized}`);
    } catch (err) { console.error('Cleanup error:', err); }
}

// 8. Message Handlers (Typing/Recording)
function setupMessageHandlers(socket, sessionNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        try {
            let autoTyping = config.AUTO_TYPING;
            let autoRecording = config.AUTO_RECORDING;

            if (sessionNumber) {
                const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
                if (userConfig.AUTO_TYPING !== undefined) autoTyping = userConfig.AUTO_TYPING;
                if (userConfig.AUTO_RECORDING !== undefined) autoRecording = userConfig.AUTO_RECORDING;
            }

            if (autoTyping === 'true') await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
            if (autoRecording === 'true') await socket.sendPresenceUpdate('recording', msg.key.remoteJid);

        } catch (error) {}
    });
}

// ---------------- 9. COMMAND HANDLER (The Big One) ----------------

function setupCommandHandlers(socket, number) {

    // INTERNAL HELPER for commands
    const downloadMedia = async (msg) => {
        try {
            const type = Object.keys(msg)[0];
            const stream = await downloadContentFromMessage(msg[type], type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            return buffer;
        } catch (e) { return null; }
    };

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const type = getContentType(msg.message);
        if (!msg.message) return;
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

        const from = msg.key.remoteJid;
        const sender = from;
        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = (nowsender || '').split('@')[0];

        // =================================================================
        // 🛡️ DARK TECH ZONE - NO PREFIX INTERVIEW LOGIC
        // =================================================================

        if (global.interviewSessions.has(sender)) {
            const session = global.interviewSessions.get(sender);
            const dtQuestions = [
                "👤 ඔබේ සම්පූර්ණ නම මොකද්ද? (Full Name)",
                "🎂 වයස කීයද? (Age)",
                "🏡️ පදිංචිය කොහෙද? (Address/City)",
                "💻 ඔයාට පුළුවන් Tech/Coding දේවල් මොනවද?",
                "🤔 ඇයි Dark Tech Zone එකට එන්න කැමති?"
            ];
            const totalTextQ = dtQuestions.length;
            const adminNumber = config.OWNER_NUMBER + "@s.whatsapp.net";

            const isText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            const isImage = msg.message?.imageMessage;

            if (isText && (isText.toLowerCase() === 'cancel' || isText.toLowerCase() === 'stop')) {
                global.interviewSessions.delete(sender);
                await socket.sendMessage(sender, { text: '❌ Interview process cancelled.' }, { quoted: msg });
                return;
            }

            if (session.step < totalTextQ) {
                if (isText) {
                    await socket.sendPresenceUpdate('composing', sender);
                    session.answers.push(isText);
                    session.step += 1;

                    if (session.step < totalTextQ) {
                        await socket.sendMessage(sender, { text: `📝 *Question ${session.step + 1}*\n\n${dtQuestions[session.step]}` }, { quoted: msg });
                    } else {
                        await socket.sendMessage(sender, { text: `📸 *Photo Request (1/2)*\n\nකරුණාකර ඔබගේ පැහැදිලි ඡායාරූපයක් එවන්න.\n(Please send a photo of yourself)` }, { quoted: msg });
                    }
                }
            } else if (session.step === totalTextQ) {
                if (isImage) {
                    await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });
                    const buffer = await downloadMedia(msg.message);
                    if (buffer) {
                        session.photos.push(buffer);
                        session.step += 1;
                        await socket.sendMessage(sender, { text: `📸 *Photo Request (2/2)*\n\nදැන් ID එකේ හෝ ඔයාගේ Design එකක ෆොටෝ එකක් එවන්න.` }, { quoted: msg });
                    }
                } else {
                    await socket.sendMessage(sender, { text: '⚠️ Please send a PHOTO (Image) only.' }, { quoted: msg });
                }
            } else if (session.step === totalTextQ + 1) {
                if (isImage) {
                    await socket.sendMessage(sender, { react: { text: "🔄", key: msg.key } });
                    const buffer = await downloadMedia(msg.message);
                    if (buffer) {
                        session.photos.push(buffer);
                        const slTime = moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
                        const ans = session.answers;
                        const reportText = `
┏━━━━━━━━━━━━━━━━━━━┓
┃ 🛡️ *NEW APPLICATION*
┗━━━━━━━━━━━━━━━━━━━┛
🚀 *Team:* Dark Tech Zone
👤 *Applicant:* +${sender.split('@')[0]}
🕒 *Time:* ${slTime}

📝 *Answers:*
1️⃣ Name: ${ans[0]}
2️⃣ Age: ${ans[1]}
3️⃣ City: ${ans[2]}
4️⃣ Skills: ${ans[3]}
5️⃣ Reason: ${ans[4]}

📸 *Photos Attached Below* 👇`;

                        let botLogo = config.RCD_IMAGE_PATH;
                        await socket.sendMessage(adminNumber, { image: { url: botLogo }, caption: reportText, mentions: [sender] });
                        await socket.sendMessage(adminNumber, { image: session.photos[0], caption: `👤 *User Photo*` });
                        await socket.sendMessage(adminNumber, { image: session.photos[1], caption: `🆔 *Proof/Work*` });
                        await socket.sendMessage(sender, { text: `✅ *Application Submitted Successfully!*\n\nඔබේ විස්තර Admin වෙත යොමු කෙරුණා.\n\n> 🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥` }, { quoted: msg });
                        global.interviewSessions.delete(sender);
                    }
                } else {
                    await socket.sendMessage(sender, { text: '⚠️ Please send a PHOTO (Image) only.' }, { quoted: msg });
                }
            }
            return;
        }
        // =================================================================

        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber);
        const isGroup = from.endsWith("@g.us");

        const body = (type === 'conversation') ? msg.message.conversation
            : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
            : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
            : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
            : '';

        if (!body || typeof body !== 'string') return;

        const prefix = config.PREFIX;
        const isCmd = body && body.startsWith && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
        const args = body.trim().split(/ +/).slice(1);

        // Helper: download quoted media (duplicate needed for command context)
        async function downloadQuotedMedia(quoted) {
            if (!quoted) return null;
            const qTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            const qType = qTypes.find(t => quoted[t]);
            if (!qType) return null;
            const messageType = qType.replace(/Message$/i, '').toLowerCase();
            const stream = await downloadContentFromMessage(quoted[qType], messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            return {
                buffer,
                mime: quoted[qType].mimetype || '',
                caption: quoted[qType].caption || quoted[qType].fileName || '',
                ptt: quoted[qType].ptt || false,
                fileName: quoted[qType].fileName || ''
            };
        }

        if (!command) return;

        try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};

            if (!isOwner) {
                const workType = userConfig.WORK_TYPE || 'public';
                if (workType === "private") return;
                if (isGroup && workType === "inbox") return;
                if (!isGroup && workType === "groups") return;
            }

            switch (command) {
                case 'apply':
                case 'join':
                case 'interview': {
                    if (global.interviewSessions.has(sender)) {
                        return await socket.sendMessage(sender, { text: '⚠️ You are already in an interview!' }, { quoted: msg });
                    }
                    global.interviewSessions.set(sender, { step: 0, answers: [], photos: [] });
                    const welcome = `
🛡️ *DARK TECH ZONE RECRUITMENT* 🛡️

👋 ආයුබෝවන්!
අපේ Team එකට එකතු වෙන්න කැමතිද?

⚠️ *උපදෙස්:*
1. ප්‍රශ්න වලට කෙලින්ම Reply කරන්න (Prefix එපා).
2. පසුව ෆොටෝ 2ක් ඉල්ලනු ඇත.

👇 *පළමු ප්‍රශ්නය:*
👤 ඔබේ සම්පූර්ණ නම මොකද්ද? (Full Name)
`;
                    let imagePayload = String(config.RCD_IMAGE_PATH).startsWith('http') ? { url: config.RCD_IMAGE_PATH } : fs.readFileSync(config.RCD_IMAGE_PATH);
                    await socket.sendMessage(sender, { image: imagePayload, caption: welcome }, { quoted: msg });
                    break;
                }

                // ... ALL OTHER COMMANDS HERE ...
                // (Paste your existing command cases here like 'menu', 'ping', etc.)
                // For brevity in this response, I'm including the critical ones.

                case 'ping':
                    await socket.sendMessage(sender, { text: 'Pong!' }, { quoted: msg });
                    break;

                default:
                    break;
            }
        } catch (err) {
            console.error('Command handler error:', err);
        }
    });
}

// ---------------- MAIN FUNCTION (EmpirePair) ----------------

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
    await initMongo().catch(() => {});

    try {
        const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
        if (mongoDoc && mongoDoc.creds) {
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
            if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
        }
    } catch (e) {}

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'silent' });

    try {
        const socket = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        // 🔥 CALLING HANDLERS (NOW DEFINED ABOVE)
        setupStatusHandlers(socket, sanitizedNumber);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket, sanitizedNumber);
        handleMessageRevocation(socket, sanitizedNumber);
        setupAutoMessageRead(socket, sanitizedNumber);
        setupCallRejection(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
                catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
            }
            if (!res.headersSent) res.send({ code });
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            try {
                const credsPath = path.join(sessionPath, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const content = await fs.readFile(credsPath, 'utf8');
                    const credsObj = JSON.parse(content);
                    await saveCredsToMongo(sanitizedNumber, credsObj, state.keys);
                }
            } catch (e) {}
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                activeSockets.set(sanitizedNumber, socket);
                await addNumberToMongo(sanitizedNumber);
            }
            if (connection === 'close') {
                try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) {}
            }
        });

        activeSockets.set(sanitizedNumber, socket);

    } catch (error) {
        console.error('Pairing error:', error);
        if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
    }
}

// ---------------- ENDPOINTS ----------------

async function joinGroup(socket) { return { status: 'failed', error: 'Not configured' }; }

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number required' });
    await EmpirePair(number, res);
});

// ... (Include other endpoints like /api/active etc. here if needed) ...

initMongo().catch(err => console.warn('Mongo init failed', err));
(async () => {
    try {
        const nums = await getAllNumbersFromMongo();
        if (nums && nums.length) {
            for (const n of nums) {
                if (!activeSockets.has(n)) {
                    const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                    await EmpirePair(n, mockRes);
                    await delay(500);
                }
            }
        }
    } catch (e) {}
})();

module.exports = router;
