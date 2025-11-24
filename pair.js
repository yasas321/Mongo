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

// ---------------- CONFIGURATION ----------------

const BOT_NAME_FANCY = '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥';

// GROUP IDs
const ID_DETAILS_GROUP = '120363404052417379@g.us'; // ඇප්ලිකේෂන් එන තැන
const ID_MAIN_GROUP = '120363333832731849@g.us';    // මෙම්බර්ව ඇඩ් කරන තැන

// AUTO WALLPAPER SETTINGS
const CHANNEL_ID_WALLPAPER = '120363405066463916@newsletter'; // වෝල්පේපර් යන චැනල් එක
const WALLPAPER_INTERVAL = 30 * 60 * 1000; // විනාඩි 10 (මිලි තත්පර වලින්)

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
    BOT_NAME: '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥',
    BOT_VERSION: '1.0.0V',
    OWNER_NAME: 'Yasas Dileepa',
    BOT_FOOTER: '🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥'
};

// ---------------- MONGO DB CONNECTION ----------------

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

// ---------------- MONGO HELPER FUNCTIONS ----------------

async function saveCredsToMongo(number, creds, keys = null) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
        await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    } catch (e) { console.error('saveCreds error:', e); }
}

async function loadCredsFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = await sessionsCol.findOne({ number: sanitized });
        return doc || null;
    } catch (e) { return null; }
}

async function removeSessionFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await sessionsCol.deleteOne({ number: sanitized });
    } catch (e) {}
}

async function addNumberToMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    } catch (e) {}
}

async function removeNumberFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await numbersCol.deleteOne({ number: sanitized });
    } catch (e) {}
}

async function getAllNumbersFromMongo() {
    try {
        await initMongo();
        const docs = await numbersCol.find({}).toArray();
        return docs.map(d => d.number);
    } catch (e) { return []; }
}

async function loadUserConfigFromMongo(number) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        const doc = await configsCol.findOne({ number: sanitized });
        return doc ? doc.config : null;
    } catch (e) { return null; }
}

async function setUserConfigInMongo(number, conf) {
    try {
        await initMongo();
        const sanitized = number.replace(/[^0-9]/g, '');
        await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    } catch (e) {}
}

async function listNewslettersFromMongo() {
    try {
        await initMongo();
        const docs = await newsletterCol.find({}).toArray();
        return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
    } catch (e) { return []; }
}

async function listNewsletterReactsFromMongo() {
    try {
        await initMongo();
        const docs = await newsletterReactsCol.find({}).toArray();
        return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
    } catch (e) { return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
    try {
        await initMongo();
        const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
        await mongoDB.collection('newsletter_reactions_log').insertOne(doc);
    } catch (e) {}
}

async function addNewsletterToMongo(jid, emojis = []) {
    try {
        await initMongo();
        await newsletterCol.updateOne({ jid }, { $set: { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() } }, { upsert: true });
    } catch (e) {}
}

async function removeNewsletterFromMongo(jid) {
    try {
        await initMongo();
        await newsletterCol.deleteOne({ jid });
    } catch (e) {}
}

async function loadAdminsFromMongo() {
    try {
        await initMongo();
        const docs = await adminsCol.find({}).toArray();
        return docs.map(d => d.jid || d.number).filter(Boolean);
    } catch (e) { return []; }
}

async function addAdminToMongo(jidOrNumber) {
    try {
        await initMongo();
        await adminsCol.updateOne({ jid: jidOrNumber }, { $set: { jid: jidOrNumber } }, { upsert: true });
    } catch (e) {}
}

async function removeAdminFromMongo(jidOrNumber) {
    try {
        await initMongo();
        await adminsCol.deleteOne({ jid: jidOrNumber });
    } catch (e) {}
}

// ---------------- UTILS ----------------

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function getBuffer(url) {
    try {
        const res = await axios({
            method: "get",
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Requests': 1
            },
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (e) {
        return null;
    }
}

// ---------------- GLOBAL STORAGE ----------------
const activeSockets = new Map();
const socketCreationTime = new Map();
const wallpaperIntervals = new Map(); // Timer Storage
global.interviewSessions = global.interviewSessions || new Map();

// ---------------- CORE HANDLERS ----------------

// 1. STATUS HANDLER
async function setupStatusHandlers(socket, sessionNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            let userEmojis = config.AUTO_LIKE_EMOJI || ['🔥', '❤️', '👍'];
            let autoViewStatus = config.AUTO_VIEW_STATUS || 'true';
            let autoLikeStatus = config.AUTO_LIKE_STATUS || 'true';
            let autoRecording = config.AUTO_RECORDING || 'false';

            if (sessionNumber && typeof loadUserConfigFromMongo === 'function') {
                const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
                if (userConfig.AUTO_LIKE_EMOJI) userEmojis = userConfig.AUTO_LIKE_EMOJI;
                if (userConfig.AUTO_VIEW_STATUS) autoViewStatus = userConfig.AUTO_VIEW_STATUS;
                if (userConfig.AUTO_LIKE_STATUS) autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
                if (userConfig.AUTO_RECORDING) autoRecording = userConfig.AUTO_RECORDING;
            }

            if (autoRecording === 'true') {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (autoViewStatus === 'true') {
                await socket.readMessages([message.key]);
            }

            if (autoLikeStatus === 'true') {
                const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
                await socket.sendMessage(message.key.remoteJid, {
                    react: { text: randomEmoji, key: message.key }
                }, { statusJidList: [message.key.participant] });
            }
        } catch (error) {
            console.error('Status Handler Error:', error);
        }
    });
}

// 2. NEWSLETTER HANDLER
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
        } catch (e) {}
    });
}

// 3. CALL REJECTION
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
        } catch (err) {}
    });
}

// 4. Auto Message Read
async function setupAutoMessageRead(socket, sessionNumber) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message) return;
        const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
        const userConfig = await loadUserConfigFromMongo(sanitized) || {};
        if (userConfig.AUTO_READ_MESSAGE === 'all') {
            try { await socket.readMessages([msg.key]); } catch (e) {}
        }
    });
}

// 5. Message Revocation
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
            if (statusCode === 401 || (lastDisconnect?.reason === DisconnectReason?.loggedOut)) {
                await deleteSessionAndCleanup(number, socket);
            } else {
                await delay(5000);
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

async function deleteSessionAndCleanup(number, socketInstance) {
    const sanitized = number.replace(/[^0-9]/g, '');
    try {
        // Clear Wallpaper Interval
        if (wallpaperIntervals.has(sanitized)) {
            clearInterval(wallpaperIntervals.get(sanitized));
            wallpaperIntervals.delete(sanitized);
        }

        const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) {}
        activeSockets.delete(sanitized);
        try { await removeSessionFromMongo(sanitized); } catch (e) {}
        try { await removeNumberFromMongo(sanitized); } catch (e) {}
    } catch (e) {}
}

// 7. Auto Typing/Recording
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

// ---------------- MAIN COMMAND HANDLER ----------------

function setupCommandHandlers(socket, number) {

    const downloadMedia = async (msg) => {
        try {
            const type = Object.keys(msg)[0];
            const stream = await downloadContentFromMessage(msg[type], type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            return buffer;
        } catch (e) { return null; }
    };

    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];

        if (!msg.message) return;
        if (msg.key.fromMe) return; 
        if (msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const type = getContentType(msg.message);
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

        const from = msg.key.remoteJid;
        const sender = from;

        const isGroup = from.endsWith("@g.us");

        const nowsender = msg.key.participant || msg.key.remoteJid;
        const senderNumber = (nowsender || '').split('@')[0];

        // =================================================================
        // 🛡️ INTERVIEW INTERCEPTOR
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
                        await delay(1000);
                        await socket.sendMessage(sender, { text: `📝 *Question ${session.step + 1}*\n\n${dtQuestions[session.step]}` }, { quoted: msg });
                    } else {
                        await delay(1000);
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
                        await socket.sendMessage(sender, { text: `📸 *Photo Request (2/2)*\n\nදැන් ඔයා කරපු ප්‍රොජෙක්ට් එකක් එවන්න නැත්තං තව මොකක් හරි පොටො එකක් එවන්න.` }, { quoted: msg });
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

                        // REPORT TO DETAILS GROUP
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

📸 *Photos Attached Below* 👇
(Admin: Reply this message with *.approve* to select this user)`;

                        let botLogo = config.RCD_IMAGE_PATH;
                        await socket.sendMessage(ID_DETAILS_GROUP, { image: { url: botLogo }, caption: reportText, mentions: [sender] });
                        await socket.sendMessage(ID_DETAILS_GROUP, { image: session.photos[0], caption: `👤 *User Photo*` });
                        await socket.sendMessage(ID_DETAILS_GROUP, { image: session.photos[1], caption: `🆔 *Proof/Work*` });

                        await socket.sendMessage(sender, { text: `✅ *Application Submitted Successfully!*\n\nඔබේ විස්තර Admin වෙත යොමු කෙරුණා. කරුණාකර රැඳී සිටින්න.\n\n> 🐦‍🔥 ᴅᴛᴇᴄ ᴍɪɴɪ ᴠ1 🐦‍🔥` }, { quoted: msg });
                        global.interviewSessions.delete(sender);
                    }
                } else {
                    await socket.sendMessage(sender, { text: '⚠️ Please send a PHOTO (Image) only.' }, { quoted: msg });
                }
            }
            return;
        }

        // =================================================================

        const body = (type === 'conversation') ? msg.message.conversation
            : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
            : (type === 'imageMessage') ? msg.message.imageMessage.caption
            : (type === 'videoMessage') ? msg.message.videoMessage.caption
            : '';

        if (!body || typeof body !== 'string') return;

        const prefix = config.PREFIX;
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
        const args = body.trim().split(/ +/).slice(1);

        if (!command) return;

        try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            const isOwner = config.OWNER_NUMBER.includes(senderNumber);

            if (!isOwner) {
                const workType = userConfig.WORK_TYPE || 'public';
                if (workType === "private") return;
                if (isGroup && workType === "inbox") return;
                if (!isGroup && workType === "groups") return;
            }

            switch (command) {

                case 'approve':
                case 'accept': {
                    // 1. Security: Only works in Details Group
                    if (msg.key.remoteJid !== ID_DETAILS_GROUP) return;

                    // 2. Find who to add (from reply)
                    const userToAdd = msg.message?.extendedTextMessage?.contextInfo?.participant || 
                                      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

                    if (!userToAdd) {
                        return await socket.sendMessage(sender, { text: "⚠️ කරුණාකර අදාළ Application (Details) මැසේජ් එකට Reply කරමින් මෙම Command එක භාවිතා කරන්න." }, { quoted: msg });
                    }

                    // SEND LINK FUNCTION
                    const sendInviteLink = async () => {
                         try {
                             const inviteCode = await socket.groupInviteCode(ID_MAIN_GROUP);
                             const link = `https://chat.whatsapp.com/${inviteCode}`;
                             
                             await socket.sendMessage(sender, { text: "⚠️ User privacy settings නිසා කෙලින්ම Add කළ නොහැක. Inbox වෙත Invite Link එක යවන ලදී." }, { quoted: msg });

                             await socket.sendMessage(userToAdd, { 
                                text: `🎉 *Congratulations!* \n\nඔබව Dark Tech Zone කණ්ඩායම සඳහා තෝරාගෙන ඇත.\n\nඔබේ Privacy Settings නිසා අපට ඔබව කෙලින්ම Group එකට Add කළ නොහැක. කරුණාකර පහත ලින්ක් එකෙන් Join වන්න:\n\n${link}` 
                             });
                         } catch(e) {
                             await socket.sendMessage(sender, { text: "❌ Link එක යැවීමට නොහැක. Bot Admin ද කියා බලන්න." }, { quoted: msg });
                         }
                    };

                    try {
                        // 3. Send Message to User
                        await socket.sendMessage(userToAdd, { 
                            text: `🎉 *Congratulations!* \n\nඔබව Dark Tech Zone කණ්ඩායම සඳහා තෝරාගෙන ඇත. ඔබව දැන් Group එකට Add කරනු ඇත. රැඳී සිටින්න.` 
                        });

                        // 4. Try to Auto Add to Main Group
                        const response = await socket.groupParticipantsUpdate(
                            ID_MAIN_GROUP, 
                            [userToAdd], 
                            "add"
                        );

                        // CHECK STATUS
                        // Baileys status 200 means success, anything else or 403 usually implies failure/privacy
                        const status = response[0]?.status;

                        if (status === '200' || status === 200) {
                             await socket.sendMessage(sender, { text: `✅ සාමාජිකයාව (@${userToAdd.split('@')[0]}) සාර්ථකව Group එකට ඇඩ් කරන ලදී.`, mentions: [userToAdd] }, { quoted: msg });
                        } else {
                             // IF FAILED (Privacy), SEND LINK
                             await sendInviteLink();
                        }

                    } catch (e) {
                        console.log("Add Error, trying link...", e);
                        // IF ERROR, SEND LINK
                        await sendInviteLink();
                    }
                    break;
                }

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

                case 'ping':
                    await socket.sendMessage(sender, { text: '⚡ Pong!' }, { quoted: msg });
                    break;

                case 'menu':
                    const menuText = `
🤖 *${config.BOT_NAME} MENU*

👋 Hi, ${msg.pushName || 'User'}

📥 *DOWNLOAD*
.song [name]
.video [name]
.tiktok [url]
.fb [url]

🛠️ *TOOLS*
.apply (Interview)
.ping
.alive

> Powered by Yasas Dileepa
`;
                    let menuImg = String(config.RCD_IMAGE_PATH).startsWith('http') ? { url: config.RCD_IMAGE_PATH } : fs.readFileSync(config.RCD_IMAGE_PATH);
                    await socket.sendMessage(sender, { image: menuImg, caption: menuText }, { quoted: msg });
                    break;
            }

        } catch (err) {
            console.error('Command handler error:', err);
        }
    });
}

// ---------------- EMPIRE PAIR ----------------

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

        // CALL HANDLERS
        setupStatusHandlers(socket, sanitizedNumber);
        setupNewsletterHandlers(socket, sanitizedNumber);
        setupCallRejection(socket, sanitizedNumber);
        setupCommandHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoMessageRead(socket, sanitizedNumber);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
                catch (error) { retries--; await delay(2000); }
            }
            if (res && !res.headersSent) res.send({ code });
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
                await delay(2000);
                const userJid = jidNormalizedUser(socket.user.id);
                await socket.sendMessage(userJid, { text: `✅ *Connected Successfully!*\n${config.BOT_NAME} is active.` });

                // =============================================================
                // 🌟 AUTO VERTICAL WALLPAPER SENDER (Every 10 Minutes)
                // =============================================================
                if (wallpaperIntervals.has(sanitizedNumber)) {
                    clearInterval(wallpaperIntervals.get(sanitizedNumber));
                }

                const wpTimer = setInterval(async () => {
                    try {
                        // UPDATED THEMES: More Cars & Vertical Focus
                        const themes = [
                            'JDM Drift Car Neon Night', 
                            'Porsche 911 GT3 Vertical', 
                            'Lamborghini Huracan Cyberpunk', 
                            'BMW M4 Competition Street', 
                            'Nissan GTR R35 Rain', 
                            'Toyota Supra MK4 Sunset',
                            'Mercedes AMG GT Black Series',
                            'Cyberpunk City Vertical 4K', 
                            'Abstract Neon Mobile Wallpaper'
                        ];
                        const randomTheme = themes[Math.floor(Math.random() * themes.length)];

                        // AI Image Gen URL (Pollinations AI - No Key Needed)
                        // CHANGED: Width=1080, Height=1920 (Vertical/Portrait) for Lock Screens
                        const seed = Math.floor(Math.random() * 100000);
                        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(randomTheme)}%20vertical%20wallpaper%204k%20lockscreen?width=1080&height=1920&seed=${seed}&nologo=true`;

                        const buffer = await getBuffer(imageUrl);

                        if (buffer) {
                            await socket.sendMessage(CHANNEL_ID_WALLPAPER, { 
                                image: buffer, 
                                caption: `🌟 ${randomTheme}`
                            });
                            console.log('✅ Auto Wallpaper Sent');
                        }
                    } catch (e) {
                        console.log('❌ Auto Wallpaper Error:', e.message);
                    }
                }, WALLPAPER_INTERVAL);

                wallpaperIntervals.set(sanitizedNumber, wpTimer);
                // =============================================================

            }
            if (connection === 'close') {
                try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) {}
                // Clear interval on close
                if (wallpaperIntervals.has(sanitizedNumber)) {
                    clearInterval(wallpaperIntervals.get(sanitizedNumber));
                    wallpaperIntervals.delete(sanitizedNumber);
                }
            }
        });

        activeSockets.set(sanitizedNumber, socket);

    } catch (error) {
        console.error('Pairing error:', error);
        if (res && !res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
    }
}

// ---------------- ROUTES ----------------

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number required' });
    await EmpirePair(number, res);
});

// ---------------- STARTUP ----------------

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