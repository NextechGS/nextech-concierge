'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var handlebars = require('handlebars');
var path = require('path');
var moment = require('moment');
var Cesium = require('cesium');
var requestPromise = require('request-promise');
var RuntimeError = Cesium.RuntimeError;

var SlackBot = require('../../lib/SlackBot');
var RepositorySettings = require('../../lib/RepositorySettings');

describe('SlackBot', function () {
    var repositories;
    var today = moment();
    var tomorrow = moment().add(1, 'days').startOf('day');
    var earlyDate = moment().add(14, 'days').startOf('day');
    var mediumDate = moment().add(7, 'days').startOf('day');
    var user = 'omar';
    var ID = '1';
    var displayName = 'Omar';
    var configUrl = 'https://api.github.com/repos/owner/repo/contents/.slackbot.yml';
    var mockYAML;

    function setupFakeIDs() {
        SlackBot._userIDs = {};
        SlackBot._userData = {};
        SlackBot._channelIDs = {};

        SlackBot._userIDs[user] = ID;
        SlackBot._userData[ID] = {
            display_name: displayName
        };
        SlackBot._channelIDs['general'] = 1;
    }

    function getMessage(templateName) {
        var template = fs.readFileSync(path.join(__dirname, '../../lib/templates', templateName + '.hbs')).toString();

        return handlebars.compile(template)({
            name : displayName
        });
    }

    beforeEach(function () {
        repositories = {
            'owner/repo' : new RepositorySettings(),
            'owner2/repo2' : new RepositorySettings()
        };

        SlackBot._repositories = repositories;

        mockYAML = fs.readFileSync('./specs/data/slackbot.yml').toString();
    });

    afterEach(function () {
        delete repositories['owner/repo'];
    });

    it('is disabled if no Slack token is found.', function () {
        SlackBot.init({
            configUrl: configUrl
        });

        expect(SlackBot._isDisabled).toBe(true);
    });

    it('authenticates and gets Slack metadata.', function () {
        spyOn(SlackBot, '_authenticateGitHub');
        spyOn(SlackBot, '_getSlackMetadata').and.callFake(function() {
            return Promise.resolve();
        });

        SlackBot.init({
            token: 'token',
            configUrl: configUrl,
            repositories: repositories
        });

        expect(SlackBot._authenticateGitHub).toHaveBeenCalled();
        expect(SlackBot._getSlackMetadata).toHaveBeenCalled();
    });

    it('throws if postMessage is called without the required metadata.', function () {
        spyOn(SlackBot, '_authenticateGitHub');
        spyOn(SlackBot, '_getSlackMetadata').and.callFake(function() {
            return Promise.reject(new Error('Failed to obtain Slack metadata.'));
        });

        SlackBot.init({
            token: 'token',
            configUrl: configUrl,
            repositories: repositories
        });

        spyOn(SlackBot, 'postMessage').and.callThrough();
        expect(function () {
            SlackBot.postMessage('ID', 'message');
        }).toThrowError(RuntimeError);
    });

    it('posts early release reminder.', function () {
        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            var releaseSchedule = {};
            releaseSchedule[user] = earlyDate;
            return Promise.resolve({
                releaseSchedule: releaseSchedule
            });
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        return SlackBot._sendReleaseReminders()
            .then(function() {
                expect(SlackBot.postMessage).toHaveBeenCalledWith(ID, getMessage('releaseReminderEarly'));
            })
            .catch(function(error) {
                throw Error(error);
            });
    });

    it('posts release reminder.', function () {
        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            var releaseSchedule = {};
            releaseSchedule[user] = mediumDate;
            return Promise.resolve({
                releaseSchedule: releaseSchedule
            });
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        return SlackBot._sendReleaseReminders()
        .then(function() {
            expect(SlackBot.postMessage).toHaveBeenCalledWith(ID, getMessage('releaseReminder'));
        })
        .catch(function(error) {
            throw Error(error);
        });
    });

    it('posts late release reminder.', function () {
        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            var releaseSchedule = {};
            releaseSchedule[user] = today;
            return Promise.resolve({
                releaseSchedule: releaseSchedule
            });
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        return SlackBot._sendReleaseReminders()
        .then(function() {
            expect(SlackBot.postMessage).toHaveBeenCalledWith(ID, getMessage('releaseReminderLate'));
        })
        .catch(function(error) {
            throw Error(error);
        });
    });

    it('does not post release reminder on other days.', function () {
        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            var releaseSchedule = {};
            releaseSchedule[user] = tomorrow;
            return Promise.resolve({
                releaseSchedule: releaseSchedule
            });
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        return SlackBot._sendReleaseReminders()
        .then(function() {
            expect(SlackBot.postMessage).not.toHaveBeenCalled();
        })
        .catch(function(error) {
            throw Error(error);
        });
    });

    it('posts weekly statistics message.', function () {
        var yesterday = moment().subtract(1, 'days').startOf('day');
        var lastWeek = moment().subtract(7, 'days').startOf('day');

        var promiseArray = [];
        var issues = [];
        issues.push({
            pull_request: {},
            closed_at: yesterday,
            created_at: lastWeek
        });
        issues.push({
            pull_request: {},
            closed_at: yesterday,
            created_at: yesterday
        });
        promiseArray.push(Promise.resolve(issues));

        spyOn(SlackBot, '_getAllIssuesLastWeek').and.callFake(function() {
            return promiseArray;
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            return Promise.resolve({});
        });

        SlackBot._sendWeeklyStats()
        .then(function() {
            var templateName = 'weeklyStats';
            var template = fs.readFileSync(path.join(__dirname, '../../lib/templates', templateName + '.hbs')).toString();
            var messageText = handlebars.compile(template)({
                greeting : 'Happy Friday everyone!',
                averageMergeTime : '3.0',
                numberOfPullRequests : issues.length
            });
            expect(SlackBot.postMessage).toHaveBeenCalledWith(SlackBot._channelIDs['general'], messageText);
        })
        .catch(function(error) {
            throw Error(error);
        });

    });

    it('posts about unusually long PR times.', function () {
        var yesterday = moment().subtract(1, 'days').startOf('day');
        var foreverAgo = moment().subtract(701, 'days').startOf('day');

        var promiseArray = [];
        var issues = [];
        var title = 'Old Pull Request';
        var url = 'url';
        issues.push({
            pull_request: {},
            title: title,
            html_url: url,
            closed_at: yesterday,
            created_at: foreverAgo
        });
        for(var i = 0; i < 10; ++i) {
            issues.push({
                pull_request: {},
                closed_at: yesterday,
                created_at: yesterday
            });
        }

        promiseArray.push(Promise.resolve(issues));

        spyOn(SlackBot, '_getAllIssuesLastWeek').and.callFake(function() {
            return promiseArray;
        });

        setupFakeIDs();

        spyOn(SlackBot, 'postMessage');

        spyOn(SlackBot, '_getConfig').and.callFake(function() {
            return Promise.resolve({});
        });

        SlackBot._sendWeeklyStats()
        .then(function() {
            var templateName = 'weeklyStats';
            var template = fs.readFileSync(path.join(__dirname, '../../lib/templates', templateName + '.hbs')).toString();
            var messageText = handlebars.compile(template)({
                greeting : 'Happy Friday everyone!',
                averageMergeTime : '63.6',
                numberOfPullRequests : issues.length,
                longMergeTitle : title,
                longMergeURL : url,
                longMergeTime : '700.0'
            });
            expect(SlackBot.postMessage).toHaveBeenCalledWith(SlackBot._channelIDs['general'], messageText);
        })
        .catch(function(error) {
            throw Error(error);
        });

    });

    it('_getConfig works.', function () {
        spyOn(SlackBot, '_authenticateGitHub');
        spyOn(SlackBot, '_getSlackMetadata').and.callFake(function() {
            return Promise.resolve();
        });

        SlackBot.init({
            token: 'token',
            configUrl: configUrl,
            repositories: repositories
        });

        spyOn(requestPromise, 'get').and.callFake(function (options) {
            if (options.url === configUrl) {
                return Promise.resolve({
                    content: Buffer.from(mockYAML).toString('base64')
                });
            }
            return Promise.reject(new Error('Unexpected Url: ' + options.url));
        });

        SlackBot._getConfig()
            .then(function (slackBotSettings) {
                var date = moment('2/4/2019', 'MM/DD/YYYY').startOf('day');
                expect(slackBotSettings.releaseSchedule['oshehata'].format()).toBe(date.format());
            })
            .catch(function(error) {
                throw Error(error);
            });
    });

    it('_getSlackMetadata works.', function () {
        var channels = [];
        channels.push({
            name: 'channel1',
            id: '1'
        });
        channels.push({
            name: 'channel2',
            id: '2'
        });

        var members = [];
        members.push({
            name: 'member1',
            id: '1'
        });
        members.push({
            name: 'member2',
            id: '2'
        });

        spyOn(SlackBot, '_getAllChannels').and.callFake(function() {
            return Promise.resolve(channels);
        });
        spyOn(SlackBot, '_getAllUsers').and.callFake(function() {
            return Promise.resolve(members);
        });

        SlackBot._userIDs = {};
        SlackBot._userData = {};
        SlackBot._channelIDs = {};

        SlackBot._getSlackMetadata()
            .then(function () {
                expect(SlackBot._userIDs['member1']).toBe('1');
                expect(SlackBot._userData['2']).toBe(members[1]);
                expect(SlackBot._channelIDs['channel2']).toBe('2');
            })
            .catch(function(error) {
                throw Error(error);
            });
    });

});
