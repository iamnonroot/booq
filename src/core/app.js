const { existsSync } = require('fs');

const electron = require('electron'),
    ipcRenderer = electron.ipcRenderer,
    storage = require('electron-settings'),
    loudness = require('loudness'),
    AutoLaunch = require('auto-launch'),
    path = require('path');

const autolaunch = new AutoLaunch({
    name: 'Booq',
    path: electron.remote.app.getPath("exe"),
});

const app = angular.module('app', ['ngMaterial', 'ngMessages']);

const assets = path.join(electron.remote.app.getAppPath(), 'src', 'assets');

const sounds = [
    {
        name: 'Air horn',
        path: path.join(assets, 'sounds', 'airhorn.mp3')
    },
    {
        name: 'Fart',
        path: path.join(assets, 'sounds', 'fart.mp3')
    },
    {
        name: 'War horn',
        path: path.join(assets, 'sounds', 'war-horn.wav')
    },
    {
        name: 'Dialup',
        path: path.join(assets, 'sounds', 'dialup.wav')
    }
];

let audio = new Audio();
audio.loop = true;

let notification, vol = -1;

app.directive('autoFocus', ['$timeout', function ($timeout) {
    return {
        restrict: 'A',
        link: function ($scope, $element) {
            $timeout(function () {
                $element[0].focus();
            });
        }
    }
}]);

app.directive('ngRightClick', function ($parse) {
    return function (scope, element, attrs) {
        var fn = $parse(attrs.ngRightClick);
        element.bind('contextmenu', function (event) {
            scope.$apply(function () {
                fn(scope, { $event: event });
            });
        });
    };
});

app.directive('contextMenu', [function () {
    return {
        restrict: 'A',
        require: 'mdMenu',
        link: function (scope, element, attrs, menu) {
            let prev = { x: 0, y: 0 };
            scope.$userIndex = -1;
            scope.$mdOpenContextMenu = function (event) {
                scope.$userIndex = -1;
                let doms = event.path;
                for (let dom of doms) {
                    if (dom.tagName == "MD-CARD") {
                        scope.$userIndex = parseInt(dom.getAttribute("i"));
                    }
                }
                if (attrs['authed'] == "false") return;

                menu.offsets = () => {
                    let mouse = {
                        x: event.clientX,
                        y: event.clientY
                    };
                    let offsets = {
                        left: mouse.x - prev.x,
                        top: mouse.y - prev.y
                    };
                    prev = mouse;

                    return offsets;
                };

                menu.open();
            };
        }
    };
}]);

app.config(($mdThemingProvider) => {
    $mdThemingProvider.alwaysWatchTheme(true);

    $mdThemingProvider.theme('dark')
        .primaryPalette('indigo', {
            'default': '800',
            'hue-2': '900'
        })
        .accentPalette('amber').dark();

    $mdThemingProvider.theme('blue')
        .primaryPalette('blue')
        .accentPalette('amber');

    $mdThemingProvider.theme('green')
        .primaryPalette('green')
        .accentPalette('orange');

    $mdThemingProvider.theme('cyan')
        .primaryPalette('cyan')
        .accentPalette('amber');

    $mdThemingProvider.theme('amber')
        .primaryPalette('amber')
        .accentPalette('blue');

    $mdThemingProvider.theme('red')
        .primaryPalette('red')
        .accentPalette('blue');

    $mdThemingProvider.theme('pink')
        .primaryPalette('pink')
        .accentPalette('blue');
});

app.run(async ($rootScope) => {
    $rootScope.destroying = false;

    $rootScope.theme = await storage.get('theme') || 'default';

    $rootScope.version = electron.remote.app.getVersion();

    $rootScope.lastversion = null;

    $rootScope.notification = true;

    $rootScope.volume = 100;

    $rootScope.sound = -1;

    $rootScope.soundPath = null;

    $rootScope.mute = null;

    $rootScope.minimizedlaunch = null;

    $rootScope.by = null;

    $rootScope.ing = false;

    $rootScope.ed = null; // booqed phone

    $rootScope.requestable = null; // can ask for friend request

    $rootScope.users = [];

    ipcRenderer.on('audio', async (_, res = { audio: 'off', phone: '' }) => {
        if ($rootScope.soundPath && existsSync($rootScope.soundPath) == false) {
            $rootScope.sound = 0;
            $rootScope.soundPath = null;
            audio.src = sounds[0].path;
            audio.load();
            await storage.set('sound:path', null);
        }
        if (res.audio == 'on' && $rootScope.ing == false) {
            $rootScope.ing = true;
            $rootScope.by = res.phone && res.phone.length == 11 ? res.phone : null;
            $rootScope.$apply();
            on(res);
        } else {
            audio.loop = false;
            audio.onended = () => off();
        }
    });

    ipcRenderer.on('booqed', async (_, res = { phone: '' }) => {
        $rootScope.ed = res.phone;
        $rootScope.$apply();
    });

    async function on(res) {
        if ($rootScope.mute == false) {
            vol = await loudness.getVolume();
            await loudness.setVolume($rootScope.volume);
        } else {
            audio.volume = 0;
        }
        audio.currentTime = 0;
        audio.loop = true;
        audio.onended = null;
        audio.play();

        if ($rootScope.notification == true) {
            let body = 'Some friend is booqing you !';
            if (res.phone && res.phone.length == 11) {
                let index = $rootScope.users.findIndex(item => item.phone == res.phone);
                if (index != -1) body = `${$rootScope.users[index]['fullname']} as your friend is booqing you !`;
            }
            notification = new electron.remote.Notification({
                'title': 'BooQ',
                'body': body,
                'actions': 'STOP',
            });
            notification.show();
            notification.on('click', () => off());
            notification.on('close', () => off());
        }
    }

    async function off() {
        $rootScope.ing = false;
        $rootScope.by = null;
        $rootScope.$apply();
        if (notification) notification.close();
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        if ($rootScope.mute == false || vol != -1) {
            await loudness.setVolume(vol);
        }
    }
});

app.controller('ctrl', ($scope, $rootScope, $mdDialog, $mdToast, $timeout) => {
    ipcRenderer.on('friend:added', (_, res) => {
        $rootScope.users.push(res.data.friend)
        $scope.$apply();
    })

    ipcRenderer.on('auth', (_, res = { friends: [] }) => {
        $scope.auth.ed = true;
        $scope.loading = false;
        $rootScope.users = res.friends || [];
        $scope.$apply();
    })

    ipcRenderer.on('auth:send', (_, res = { status: false }) => {
        $scope.auth.ing = false;
        if (res.status == true) {
            $scope.auth.sent = true;
            $scope.makeToast('Code sent to your phone.')
        } else {
            $scope.makeToast('Cannot send the code.');
        }
    })

    ipcRenderer.on('auth:verify', async (_, res = { status: false, data: { token: '' } }) => {
        $scope.auth.ing = false;
        if (res['status'] == false) $scope.makeToast('You\'ve enterd a bad code.');
        else {
            let token = res['data']['token'];
            await storage.set('rayconnect-token', token);
            ipcRenderer.send('auth', token);
            $scope.auth = {
                'phone': '',
                'code': '',
                'sent': false,
                'ing': false,
                'ed': true
            };
            $scope.$apply();
        }
    });

    ipcRenderer.on('friend:request', (_, res = { fullname: '', phone: '' }) => {
        $scope.openFriendDialog(null, null, res);
        if ($rootScope.notification == true) {
            notification = new electron.remote.Notification({
                'title': 'BooQ',
                'body': `You have a friend request from ${res.fullname}.`,
            });
            notification.show();
        }
    });

    $scope.auth = {
        'phone': '',
        'code': '',
        'sent': false,
        'ing': false,
        'ed': false
    };

    $scope.loading = true;

    $scope.onMuteChange = (event) => {
        $rootScope.mute = event;
    }

    $scope.init = async () => {
        document.body.removeAttribute('style');
        let token = await storage.get('rayconnect-token');
        if (!token) {
            $scope.loading = false;
            $scope.$apply();
        } else {
            ipcRenderer.send('auth', { token });
        }

        let notification = await storage.get('notification'),
            volume = await storage.get('volume'),
            sound = await storage.get('sound'),
            soundPath = await storage.get('sound:path'),
            minimizedlaunch = await storage.get('launch:minimized'),
            requestable = await storage.get('requestable'),
            mute = await storage.get('mute');

        if (mute)
            $rootScope.mute = mute == 'true' ? true : false;

        if (requestable)
            $rootScope.requestable = requestable == 'true' ? true : false;

        if (minimizedlaunch)
            $rootScope.minimizedlaunch = minimizedlaunch == 'true' ? true : false;

        if (notification)
            $rootScope.notification = notification == 'true' ? true : false;

        if (volume)
            $rootScope.volume = parseInt(volume);

        if (soundPath) {
            if (existsSync(soundPath))
                $rootScope.soundPath = soundPath;
            else {
                sound = '0';
                await storage.set('sound:path', null);
            }
        } else if (sound == '-1') sound = '0';

        $rootScope.sound = sound ? parseInt(sound) : 0;

        audio.src = soundPath && $rootScope.sound == -1 ? soundPath : sounds[$rootScope.sound].path;
        audio.load();
    }

    $scope.minimize = () => {
        electron.remote.getCurrentWindow().minimize();
    }

    $scope.close = () => {
        electron.remote.getCurrentWindow().hide();
    }

    $scope.authSend = async () => {
        if ($scope.auth.phone.length == 0) $scope.makeToast('Enter your phone number.');
        else if ($scope.auth.phone.length != 11) $scope.makeToast('Your phone number must be 11 digits.')
        else {
            try {
                $scope.auth.ing = true;
                ipcRenderer.send('auth:send', { phone: $scope.auth.phone });
            } catch (error) {
                console.log(error);
                $scope.auth.ing = false;
                $scope.makeToast('Error on send code!');
            }
        }
    }

    $scope.authVerify = async () => {
        if ($scope.auth.code.length == 0) $scope.makeToast('Enter the sent code.');
        else if ($scope.auth.code.length != 4) $scope.makeToast('The sent code must be 4 digits.');
        else {
            try {
                $scope.auth.ing = true;
                ipcRenderer.send('auth:verify', { phone: $scope.auth.phone, code: $scope.auth.code });
            } catch (error) {
                $scope.auth.ing = false;
                $scope.makeToast('Error on verify code!');
            }
        }
    }

    $scope.authSubmit = () => {
        $scope.auth.sent ? $scope.authVerify() : $scope.authSend();
    }

    $scope.authBack = () => {
        $scope.auth.sent = false;
        $scope.auth.code = '';
    }

    $scope.authKill = () => {
        $scope.askForConfirm(null, {
            title: 'Logout',
            content: 'Are you crazy? Do you want to leave us from the bottom of your heart?',
            no: 'No, I love you',
            yes: 'Yes, I will divorce you'
        }, async () => {
            ipcRenderer.send('auth:kill');
            audio.pause();
            audio.src = sounds[0].path;
            if (vol != -1) await loudness.setVolume(vol);
            await storage.set('rayconnect-token', null);
            await storage.set('theme', 'default');
            await storage.set('notification', null);
            await storage.set('volume', null);
            await storage.set('sound', null);
            await storage.set('sound:path', null);
            await storage.set('launch:minimized', null);
            await storage.set('requestable', null);
            await autolaunch.disable();
            $rootScope.destroying = true;
            $scope.$apply();
            $timeout(() => {
                $scope.auth = {
                    'phone': '',
                    'code': '',
                    'sent': false,
                    'ing': false,
                    'ed': false
                };
                $rootScope.theme = 'default';
                $rootScope.lastversion = null;
                $rootScope.notification = true;
                $rootScope.volume = 100;
                $rootScope.sound = -1;
                $rootScope.soundPath = null;
                $rootScope.mute = false;
                $rootScope.minimizedlaunch = null;
                $rootScope.by = null;
                $rootScope.ing = false;
                $rootScope.requestable = true;
                $rootScope.users = [];
                $scope.$apply();
            }, 4000);
            $timeout(() => {
                $rootScope.destroying = false;
                $scope.$apply();
            }, 5000);
        });
    }

    $scope.openFriendDialog = (event, index = null, user = null) => {
        let fullname = '', phone = '', id = '';

        if (index != null) {
            fullname = $scope.users[index]['fullname'];
            phone = $scope.users[index]['phone'];
            id = $scope.users[index]['id']
        }

        if (user != null) {
            fullname = user.fullname;
            phone = user.phone;
        }

        $mdDialog.show({
            controller: FormControl,
            templateUrl: './template/form.html',
            parent: angular.element(document.body),
            targetEvent: event,
            focusOnOpen: false,
            locals: {
                user: {
                    fullname: fullname,
                    phone: phone,
                }
            }
        }).then((result) => {
            if (result == null) return;
            if (index == null) ipcRenderer.send('friend:create', result)
            else {
                result.id = id;
                ipcRenderer.send('friend:update', result)
                $rootScope.users[index] = result
            };
        });
    }

    $scope.askForDelete = (event, index) => {
        let id = $scope.users[index].id;
        $scope.askForConfirm(event, {
            title: 'Delete your friend',
            content: 'Are you upset with your friend and want to delete it?',
            no: 'No',
            yes: 'Yes'
        }, () => {
            ipcRenderer.send('friend:delete', {
                id
            })

            $rootScope.users.splice(index, 1);

            $scope.makeToast('Bye Bye my friend !')
        });
    }

    $scope.askForConfirm = (event, data, callback) => {
        $mdDialog.show({
            controller: ConfirmControl,
            templateUrl: './template/confirm.html',
            parent: angular.element(document.body),
            targetEvent: event,
            locals: {
                data
            }
        }).then((status) => {
            if (status == true) callback();
        });
    }

    $scope.makeToast = (message = '') => {
        $mdToast.show(
            $mdToast.simple().textContent(message).action('OK').highlightAction(true).highlightClass('md-accent').position('left bottom').hideDelay(3000)
        );
    }

    $scope.openSettings = (event) => {
        $mdDialog.show({
            controller: SettingsControl,
            templateUrl: './template/settings.html',
            parent: angular.element(document.body),
            targetEvent: event,
            focusOnOpen: false,
        }).then((res) => {
            if (res == 'logout') $scope.authKill();
        });
    }

    $scope.openBigButton = (event, index) => {
        $mdDialog.show({
            controller: BigButtonControl,
            templateUrl: './template/big-button.html',
            parent: angular.element(document.body),
            targetEvent: event,
            focusOnOpen: false,
            locals: {
                index
            }
        });
    }

    $scope.okey = async () => {
        $rootScope.ing = false;
        $rootScope.by = null;
        if (notification) notification.close();
        audio.pause();
        audio.currentTime = 0;
        await loudness.setVolume(vol);
        $rootScope.$apply();
    }

    $scope.init();
});

function FormControl($rootScope, $scope, $mdDialog, $mdToast, user) {
    $scope.theme = $rootScope.theme;
    $scope.fullname = user.fullname;
    $scope.phone = user.phone;

    $scope.close = () => {
        $mdDialog.hide();
    }

    $scope.submit = () => {
        if ($scope.fullname.length == 0) $scope.makeToast('Enter your firend fullname.');
        else if ($scope.phone.length == 0) $scope.makeToast('Enter your friend phone number.');
        else if ($scope.phone.length != 11) $scope.makeToast('Your friend phone number must be 11 digits.');
        else {
            $mdDialog.hide({ fullname: $scope.fullname, phone: $scope.phone });
        }
    }

    $scope.makeToast = (message = '') => {
        $mdToast.show(
            $mdToast.simple().textContent(message).action('OK').highlightAction(true).highlightClass('md-accent').position('left bottom').hideDelay(3000)
        );
    }
}

function ConfirmControl($rootScope, $scope, $mdDialog, data) {
    $scope.theme = $rootScope.theme;

    $scope.title = data.title;
    $scope.content = data.content;
    $scope.no = data.no;
    $scope.yes = data.yes;

    $scope.close = (status = false) => {
        $mdDialog.hide(status);
    }
}

function SettingsControl($scope, $rootScope, $mdDialog, $timeout) {
    $scope.view = null;
    $scope.colors = ['default', 'blue', 'cyan', 'green', 'amber', 'red', 'pink'];
    $scope.version = $rootScope.version;
    $scope.notification = $rootScope.notification;
    $scope.mute = $rootScope.mute;
    $scope.lastversion = $rootScope.lastversion;
    $scope.volume = $rootScope.volume;
    $scope.systemVolume = -1;
    $scope.launchable = null;
    $scope.minimizedlaunch = $rootScope.minimizedlaunch;
    $scope.requestable = $rootScope.requestable;
    $scope.sounds = sounds;
    $scope.sound = $rootScope.sound;
    $scope.soundPath = $rootScope.soundPath;
    $scope.playing = null;

    $scope.destroy = () => {
        destrois += 1;
        if (destrois >= 8) {
            destrois = 0;
            $scope.close();
            $timeout(() => {
                $rootScope.destroying = true;

                $timeout(() => {
                    $rootScope.destroying = false
                }, 14000);
            }, 1000);

        }
    }

    $scope.onRequestableChange = (event) => {
        $rootScope.requestable = event;
        storage.set('requestable', event.toString());
    }

    $scope.setView = (to = null) => {
        $scope.view = to;
    }

    $scope.setTheme = (name) => {
        $rootScope.theme = name;
        storage.set('theme', name);
    }

    $scope.onModeChange = (event) => {
        $scope.setTheme(event ? 'dark' : 'default');
    }

    $scope.onMinimizedlaunchChange = (event) => {
        $rootScope.minimizedlaunch = event;
        storage.set('launch:minimized', event.toString());
    }

    $scope.onNotificationChange = (event) => {
        $rootScope.notification = event;
        storage.set('notification', event.toString());
    }

    $scope.onMuteChange = (event) => {
        $rootScope.mute = event;
        storage.set('mute', event.toString());
    }

    let effect = new Audio(path.join(assets, 'sounds', 'sound.wav'));
    $scope.playSoundChange = () => {
        return new Promise((resolve) => {
            if (effect.played) {
                effect.pause();
                effect.currentTime = 0;
                effect.onended = null;
            }
            effect.play();
            effect.onplay = async () => {
            }
            effect.onended = async () => {
                resolve();
            }
        });
    }
    
    $scope.onVolumeChange = async (event) => {
        $rootScope.volume = parseInt(event);
        storage.set('volume', event.toString());
        vol = await loudness.getVolume();
        await loudness.setVolume($rootScope.volume);
        await $scope.playSoundChange(parseInt(event));
        await loudness.setVolume(vol);
    }
    
    $scope.onSystemVolumeChange = async (event) => {
        vol = parseInt(event);
        await loudness.setVolume(vol);
        await $scope.playSoundChange();
    }

    $scope.setSystemVolume = async () => {
        let value = await loudness.getVolume();
        $scope.systemVolume = parseInt(value);
    }

    $scope.close = () => {
        $mdDialog.hide();
        sound.pause();
    }

    $scope.logout = () => {
        $mdDialog.hide('logout');
    }

    $scope.checkForUpdate = async () => {
        try {
            let res = await (await fetch('https://raw.githubusercontent.com/iamnonroot/booq/main/package.json')).json();
            if (res && res['version']) {
                $scope.lastversion = res['version'];
                $rootScope.lastversion = res['version'];
                $scope.$apply();
            }
        } catch (error) {
            $scope.lastversion = $scope.version;
            $rootScope.lastversion = $scope.version;
            $scope.$apply();
        }
    }

    $scope.showDownloadPage = () => {
        if ($scope.lastversion != $scope.version) {
            electron.shell.openExternal('https://github.com/iamnonroot/booq/releases');
        }
    }

    $scope.checkAutoLaunch = async () => {
        $scope.launchable = await autolaunch.isEnabled();
    }

    $scope.setAutoLaunch = async (event) => {
        $scope.launchable = event;
        event ? await autolaunch.enable() : await autolaunch.disable();
        if (event == false && $scope.minimizedlaunch == true) $scope.onMinimizedlaunchChange(false);
    }

    let sound = new Audio();

    sound.onplay = async () => {
        vol = await loudness.getVolume();
        await loudness.setVolume($rootScope.volume);
    }

    sound.onpause = async () => {
        await loudness.setVolume(vol);
    }

    $scope.soundOf = (index) => {
        if ($scope.playing == index) {
            sound.pause();
            sound.onended = null;
            sound.currentTime = 0;
            $scope.playing = null;
        } else {
            sound.pause();
            sound.src = index == -1 ? $scope.soundPath : sounds[index].path;
            sound.load();
            sound.currentTime = 0;
            sound.play();
            sound.onended = () => {
                $scope.soundOf(index);
                $scope.$apply();
            }
            $scope.playing = index;
        }
    }

    $scope.onSoundChange = async (index) => {
        sound.pause();
        sound.currentTime = 0;

        if (index != -1) {
            $scope.soundPath = null;
            await storage.set('sound:path', null);
        } else {
            await storage.set('sound:path', $scope.soundPath)
        }
        $rootScope.sound = index;
        $scope.sound = index;
        $scope.playing = null;
        storage.set('sound', index.toString());
        audio.src = index == -1 ? $scope.soundPath : sounds[index].path;
        audio.load();
        $scope.$apply();
    }

    $scope.selectSound = () => {
        electron.remote.dialog.showOpenDialog({
            properties: ['openFile'], filters: [
                {
                    name: 'Sound',
                    extensions: ['mp3']
                }
            ]
        }).then(result => {
            if (result.filePaths && result.filePaths.length != 0) {
                let file = result.filePaths[0];
                $scope.soundPath = file;
                $rootScope.soundPath = file;
                $scope.onSoundChange(-1);
            }
        }).catch(error => {
            console.log(error);
        })
    }

    if ($scope.lastversion == null) {
        $timeout(() => {
            $scope.checkForUpdate();
        }, 1000);
    }

    $scope.checkAutoLaunch();
    $scope.setSystemVolume();
}

function BigButtonControl($scope, $rootScope, $mdDialog, $timeout, index) {
    $scope.user = $rootScope.users[index];
    $scope.ed = false;
    $scope.booqing = false;

    ipcRenderer.on('booqed', async (_, res = { phone: '' }) => {
        $scope.ed = res.phone == $scope.user.phone;
        $rootScope.ed = res.phone;
        $scope.$apply();
        $timeout(() => {
            $scope.ed = false;
            $rootScope.ed = null;
            $scope.$apply();
        }, 5000);
    });

    $scope.close = () => {
        $rootScope.ed = null;
        $mdDialog.hide();
    }

    $scope.sendPlay = () => {
        $scope.booqing = true;
        ipcRenderer.send('booq', {
            audio: 'on',
            to: $scope.user['phone'],
        });
    }

    $scope.sendPause = () => {
        if ($scope.booqing == true)
            ipcRenderer.send('booq', {
                audio: 'off',
                to: $scope.user['phone'],
            });
    }
}

let destrois = 0;