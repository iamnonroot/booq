const electron = require('electron'), ipcRenderer = electron.ipcRenderer, storage = require('electron-settings'), loudness = require('loudness');

const app = angular.module('app', ['ngMaterial', 'ngMessages']);

let audio = new Audio('./assets/airhorn.mp3');
audio.load();
audio.loop = true;

let notification, vol = 0;

app.run(($rootScope) => {
    $rootScope.version = electron.remote.app.getVersion();

    $rootScope.notification = false;

    $rootScope.online = true;

    $rootScope.users = [];

    ipcRenderer.on('audio', async (_, res = { audio: 'off', phone: '' }) => {
        audio.currentTime = 0;
        if (res.audio == 'on') {
            vol = await loudness.getVolume();
            await loudness.setVolume(100);
            audio.play();

            if (rootScope.notification == true) {
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
                notification.on('click', () => pauseAudio());
                notification.on('close', () => pauseAudio());
            }
        } else {
            if (notification) notification.close();
            audio.pause();
            await loudness.setVolume(vol);
        }
    });
});

app.controller('ctrl', ($scope, $rootScope, $mdDialog, $mdToast) => {

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

    $scope.init = async () => {
        let token = await storage.get('rayconnect-token');
        if (!token) {
            $scope.loading = false;
            $scope.$apply();
        } else {
            ipcRenderer.send('auth', { token });
        }
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
            yes: 'I will divorce you'
        }, async () => {
            ipcRenderer.send('auth:kill');
            await storage.unset('rayconnect-token');
            $scope.auth.ed = false;
            $rootScope.users = [];
        });
    }

    $scope.openFriendDialog = (event, index = null) => {
        let fullname = '', phone = '', id = '';

        if (index != null) {
            fullname = $scope.users[index]['fullname'];
            phone = $scope.users[index]['phone'];
            id = $scope.users[index]['id']
        }

        $mdDialog.show({
            controller: FormControl,
            templateUrl: './template/form.html',
            parent: angular.element(document.getElementById('body')),
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

    $scope.askForDelete = (event, id, index) => {
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
            parent: angular.element(document.getElementById('body')),
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
            parent: angular.element(document.getElementById('body')),
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
            parent: angular.element(document.getElementById('body')),
            targetEvent: event,
            focusOnOpen: false,
            locals: {
                index
            }
        });
    }

    $scope.init();
});

function FormControl($scope, $mdDialog, $mdToast, user) {
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

function ConfirmControl($scope, $mdDialog, data) {
    $scope.title = data.title;
    $scope.content = data.content;
    $scope.no = data.no;
    $scope.yes = data.yes;

    $scope.close = (status = false) => {
        $mdDialog.hide(status);
    }
}

function SettingsControl($scope, $rootScope, $mdDialog) {
    $scope.version = $rootScope.version;
    $scope.notification = $rootScope.notification;

    $scope.onNotificationChange = () => {
        $rootScope.notification = $scope.notification;
    }

    $scope.close = () => {
        $mdDialog.hide();
    }

    $scope.logout = () => {
        $mdDialog.hide('logout');
    }
}

function BigButtonControl($scope, $rootScope, $mdDialog, index) {
    $scope.user = $rootScope.users[index];
    $scope.booqing = false;

    $scope.close = () => {
        $mdDialog.hide();
    }

    $scope.sendPlay = () => {
        $scope.booqing = true;
        ipcRenderer.send('booq', {
            audio: 'on'
        });
    }

    $scope.sendPause = () => {
        if ($scope.booqing == true)
            ipcRenderer.send('booq', {
                audio: 'off'
            });
    }
}