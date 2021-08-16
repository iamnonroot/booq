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
    let httpServer = http.createServer((req, res) => {
        if (req.url == '/open') win.show();
        res.end();
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
ipcMain.on('booq', async (res, req = { audio: 'off', to: '' }) => {

    try {
        let phone = rayconnect.user.uid; // user phone number
        await rayconnect.execQuery({
            'address': 'booqing',
            'uniqueID': req.to,
            'TokenID': '*',
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
    } catch (error) {

        console.log(error)
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

async function afterAuth(phone = '') {
    friends = await getFriendsByPhone(phone);
    const result = friends.map((el) => {
        if (el.friend) {
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