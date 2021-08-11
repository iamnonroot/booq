const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron'),
    path = require('path'),
    Rayconnect = require('rayconnect-client').default;

const rayconnect = new Rayconnect({
    'appID': 'booq',
    'scopes': 'friend,ring',
    'space': 'main',
    'type': 'client',
});


let win, tray;

let user = [], // logined user tokens
    friends = []; // user friends

function createWindow() {
    win = new BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 450,
        minHeight: 400,
        show: false,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        }
    });

    win.once('ready-to-show', () => {
        setTimeout(() => {
            win.show();
        }, 1000);
    });

    win.loadFile(path.join(__dirname, 'src', 'index.html'));

    tray = new Tray(path.join(__dirname, 'src', 'assets', 'image', 'logo.png'));
    tray.setToolTip('BooQ');
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: 'Open Booq',
            type: 'normal',
            click: () => {
                win.show();
            }
        },
        {
            label: 'Kill Booq',
            type: 'normal',
            click: () => {
                app.exit();
            }
        }
    ]));
};

app.whenReady()
    .then(() => {
        createWindow();
    });

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('auth', async (res, req = { token: '' }) => {
    await rayconnect.Auth(req.token);
    let phone = rayconnect.user.uid;
    await afterAuth(phone, req.token);
    res.reply('auth', { friends });
    await subscribe(phone, token);
});

ipcMain.on('auth:send', async (res, req = { phone: '' }) => {
    let result = await rayconnect.RequestOTP(req.phone);
    res.reply('auth:send', result);
});

ipcMain.on('auth:verify', async (res, req = { phone: '', token: '' }) => {
    let result = await rayconnect.VerifyPhone(req.phone, req.token);
    res.reply('auth:verify', result);
});

ipcMain.on('auth:kill', async () => {
    let phone = rayconnect.user.uid, token = rayconnect.user.token;
    await unsubscribe(phone, token);
});

ipcMain.on('friend:create', async (res, req = { fullname: '', phone: '' }) => {
    let phone = rayconnect.user.uid;
    await createMyFriend(phone, req);
    res.reply('friend:create');
});

ipcMain.on('friend:update', async (res, req = { index: -1, fullname: '', phone: '' }) => {
    let phone = rayconnect.user.uid;
    await updateMyFriend(phone, req.index, { fullname: req.fullname, phone: req.phone });
    res.reply('friend:update');
});

ipcMain.on('friend:delete', async (res, req = { index: -1 }) => {
    let phone = rayconnect.user.uid;
    await deleteMyFriend(phone, req.index);
    res.reply('friend:delete');
});

// to : want booq for who by his/her phone number
ipcMain.on('booq', async (res, req = { audio: 'off', to: '' }) => {
    let tokens = await getUserTokensByPhone(req.to);
    if (tokens == null || Array.isArray(tokens) == false || tokens.length == 0) {
        let phone = rayconnect.user.uid; // user phone number
        rayconnect.execQuery({
            'address': 'booqing',
            'uniqueID': to,
            'TokenID': tokens.lastItem,
            'scope': 'ring',
            'info': {
                'method': 'GET',
                data: {
                    audio: req.audio,
                    to: req.to,
                    phone: phone
                }
            }
        });
    }
});

rayconnect.Query({
    'address': 'booqing',
    'method': 'GET',
    'scope': 'ring'
}, (res) => {
    if (res.data['audio'] == 'on') {
        let phone = res.data['phone'] || '';
        playAudio(phone);
    }
    else if (res.data['audio'] == 'off')
        pauseAudio();
});

function playAudio(phone = '') {
    win.webContents.send('audio', { 'audio': 'on', 'phone': phone });
}

function pauseAudio() {
    win.webContents.send('audio', { 'audio': 'off' });
}

async function afterAuth(phone = '', token = '') {
    let tokens = await getUserTokensByPhone(phone), friend = await getFriendsByPhone(phone);
    if (tokens == null || Array.isArray(tokens) == false || tokens.length == 0) {
        user = [token];
        createUserTokensByPhone(phone, user);
    } else {
        user = tokens;
    }

    if (friend == null || Array.isArray(friend) == false || friend.length == 0) {
        friends = [];
        createFriendsByPhone(phone);
    } else {
        friends = friend;
    }
}

async function subscribe(phone = '', token = '') {
    if (user.includes(token) == false) {
        user.push(token);
        await setUserTokensByPhone(phone, user);
    }
}

async function unsubscribe(phone = '', token = '') {
    let index = user.indexOf(token);
    if (index != -1) {
        user.splice(index, 1);
        await setUserTokensByPhone(phone, user);
    }
}

async function createUserTokensByPhone(phone = '', tokens = []) {
    return await rayconnect.store.update(`user:${phone}`, tokens);
}

async function setUserTokensByPhone(phone = '', tokens = []) {
    return await rayconnect.store.update(`user:${phone}`, tokens);
}

async function getUserTokensByPhone(phone = '') {
    return await rayconnect.store.find(`user:${phone}`);
}

async function getFriendsByPhone(phone = '') {
    return await rayconnect.store.find(`friends:${phone}`);
}

async function setFriendsByPhone(phone = '') {
    return await rayconnect.store.update(`friends:${phone}`);
}

async function createFriendsByPhone(phone = '') {
    return await rayconnect.store.add(`friends:${phone}`);
}

async function updateMyFriend(phone = '', index = -1, firend = {}) {
    friends[index] = firend;
    await setFriendsByPhone(phone);
}

async function createMyFriend(phone = '', friend = {}) {
    friends.push(friend);
    await setFriendsByPhone(phone);
}

async function deleteMyFriend(phone = '', index = -1) {
    friends.splice(index, 1);
    await setFriendsByPhone(phone);
}