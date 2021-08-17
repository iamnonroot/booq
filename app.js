const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron'),
    path = require('path'),
    storage = require('electron-settings'),
    Rayconnect = require('rayconnect-client').default,
    http = require('http'),
    net = require('net'),
    server = net.createServer(),
    PORT = 10879;

server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        http.get(`http://127.0.0.1:${PORT}/open`, () => {
            app.quit();
        });
    }
});

server.once('listening', () => {
    server.close();
    let httpServer = http.createServer(async (req, res) => {
        try {
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
                'Access-Control-Allow-Headers': 'friend',
                'Access-Control-Max-Age': 2592000, // 30 days
                'Content-Type': 'application/json'
                /** add other headers as per requirement */
            };
            res.writeHead(200, headers);
            if (req.url == '/open') win.show();
            if (req.url == '/friend' && req.method == 'GET') {
                let requestable = await storage.get('requestable');
                if (requestable == 'true') {
                    let { fullname, phone } = JSON.parse(req.headers['friend']);
                    if (fullname && fullname.length != 0 && phone && phone.length == 11 && await rayconnect.isAuth()) {
                        win.show();
                        win.webContents.send('friend:request', { fullname, phone });
                        res.write(JSON.stringify({ status: true }));
                    } else {
                        res.write(JSON.stringify({ status: false }));
                    }
                } else {
                    res.write(JSON.stringify({ status: false }));
                }
            }
            res.end();
        } catch (error) {
            res.write(JSON.stringify({ status: false }));
            res.end();
        }
    });
    httpServer.listen(PORT, "127.0.0.1");
});

server.listen(PORT);


const rayconnect = new Rayconnect({
    'appID': 'booq',
    'scopes': 'friend,ring',
    'space': 'main',
    'type': 'client',
});


let win, tray;

let friends = []; // user friends

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

    win.once('ready-to-show', async () => {
        let minimizedlaunch = await storage.get('launch:minimized');

        minimizedlaunch = minimizedlaunch == 'true' ? true : false;

        if (minimizedlaunch == false) setTimeout(() => {
            win.show();
        }, 1000);
    });

    win.loadFile(path.join(__dirname, 'src', 'index.html'));

    win.removeMenu();

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
});

ipcMain.on('auth', async (res, req = { token: '' }) => {
    await rayconnect.Auth(req.token);
    let phone = rayconnect.user.uid;
    await afterAuth(phone);
    sendOnlineStatus(true);
    res.reply('auth', { friends });
});

ipcMain.on('auth:send', async (res, req = { phone: '' }) => {
    let result = await rayconnect.RequestOTP(req.phone);
    res.reply('auth:send', result);
});

ipcMain.on('auth:verify', async (res, req = { phone: '', code: '' }) => {
    let result = await rayconnect.VerifyPhone(req.phone, req.code);
    res.reply('auth:verify', result);
});

ipcMain.on('auth:kill', async () => {
    sendOnlineStatus(false);
    friends = [];
});

ipcMain.on('friend:create', async (res, req) => {
    try {
        let phone = rayconnect.user.uid;
        const data = await createMyFriend(phone, req);
        res.reply('friend:added', { data });
    } catch (error) {
        console.log("error [21]")
        console.log(error)
    }
});

ipcMain.on('friend:update', async (res, req = { id: '', fullname: '', phone: '' }) => {
    let phone = rayconnect.user.uid;
    await updateMyFriend(phone, { id: req.id, fullname: req.fullname, phone: req.phone });
    res.reply('friend:update');
});

ipcMain.on('friend:delete', async (res, req = { id: '' }) => {
    let phone = rayconnect.user.uid;
    await deleteMyFriend(phone, req.id);
    res.reply('friend:delete');
});

// to : want booq for who by his/her phone number
ipcMain.on('booq', (res, req = { audio: 'off', to: '' }) => {
    sendBooq(req);
});

rayconnect.Query({
    'address': 'booqing',
    'method': 'GET',
    'scope': 'ring'
}, (res) => {
    if (res.data['audio'] == 'on') {
        let phone = res.data['phone'] || '';
        sendBooqed(phone);
        playAudio(phone);
    }
    else if (res.data['audio'] == 'off')
        pauseAudio();
});

rayconnect.Query({
    'address': 'booqed',
    'method': 'GET',
    'scope': 'ring'
}, (res) => {
    win.webContents.send('booqed', { phone: res.data['phone'] });
});

rayconnect.Query({
    'address': 'booqable',
    'method': 'GET',
    'scope': 'ring'
}, (res) => {
    let index = friends.findIndex((el) => el.phone == res.data['phone']);
    friends[index].online = res.data['status'];
    win.webContents.send('auth', { friends });
});

async function sendBooq(req = { audio: 'on', to: '' }) {
    let phone = rayconnect.user.uid; // user phone number
    await rayconnect.execQuery({
        'address': 'booqing',
        'uniqueID': req.to,
        'TokenID': '*',
        'scope': 'ring',
        'info': {
            'method': 'GET',
            'data': {
                audio: req.audio,
                to: req.to,
                phone: phone
            }
        }
    });
}

async function sendBooqed(to = '') {
    let phone = rayconnect.user.uid; // user phone number
    await rayconnect.execQuery({
        'address': 'booqed',
        'uniqueID': to,
        'TokenID': '*',
        'scope': 'ring',
        'info': {
            'method': 'GET',
            'data': {
                to: to,
                phone: phone
            }
        }
    });
}

async function sendOnlineStatus(status = false) {
    let phone = rayconnect.user.uid;
    try {
        await rayconnect.execQuery({
            'scope': 'ring',
            'address': 'booqable',
            'uniqueID': '*',
            'TokenID': '*',
            'info': {
                'method': 'GET',
                'data': {
                    status,
                    phone
                }
            }
        });
    } catch (error) {
        console.log(error);
    }
}

function playAudio(phone = '') {
    win.webContents.send('audio', { 'audio': 'on', 'phone': phone });
}

function pauseAudio() {
    win.webContents.send('audio', { 'audio': 'off' });
}

async function afterAuth(phone = '') {
    friends = await getFriendsByPhone(phone);
    const result = friends.map((el) => {
        if (el.friend) {
            el.friend.online = false;
            el.friend.id = el.id
            return el.friend
        } else {
            return el
        }
    })
    friends = result
    return true
}

async function getFriendsByPhone(phone = '') {
    return rayconnect.store.findAll(`friends:${phone}`);
}

async function setFriendsByPhone(phone = '', friend) {
    return rayconnect.store.update(`friends:${phone}`, friend.id, friend);
}

async function updateMyFriend(phone = '', friend = {}) {
    return setFriendsByPhone(phone, friend);
}

async function createMyFriend(phone = '', friend = {}) {
    return rayconnect.store.add(`friends:${phone}`, { friend: friend });

}
async function deleteMyFriend(phone = '', id = '') {
    return rayconnect.store.remove(`friends:${phone}`, id)
}