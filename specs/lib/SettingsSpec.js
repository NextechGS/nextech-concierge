'use strict';

var nconf = require('nconf');

nconf.file({
    file: './specs/data/configTest.json'
});

var Settings = require('../../lib/Settings');

describe('loadRepositoriesSettings', function () {
    beforeEach(function () {
        spyOn(nconf, 'env').and.returnValue(nconf);
    });

    it('returns rejected Promise when config does not have `secret`', function (done) {
        Settings.loadRepositoriesSettings('./specs/data/config_noSecret.json')
            .then(function () {
                done.fail();
            })
            .catch(function () {
                done();
            });
    });

    it('returns rejected Promise when config does not have `repositories`', function (done) {
        Settings.loadRepositoriesSettings('./specs/data/config_noRepositories.json')
            .then(function () {
                done.fail();
            })
            .catch(function () {
                done();
            });
    });

    it('returns rejected Promise when `repositories` do not have names', function (done) {
        Settings.loadRepositoriesSettings('./specs/data/config_noRepositoryNames.json')
            .then(function () {
                done.fail();
            })
            .catch(function () {
                done();
            });
    });

    it('returns rejected Promise when `repositories` do not have `gitHubToken`s', function (done) {
        Settings.loadRepositoriesSettings('./specs/data/config_noGitHubToken.json')
            .then(function () {
                done.fail();
            })
            .catch(function () {
                done();
            });
    });

    it('correctly loads values', function (done) {
        Settings.loadRepositoriesSettings('./specs/data/config_noError.json')
            .then(function (repositoryNames) {
                expect(repositoryNames).toEqual(['one', 'two']);

                expect(Settings.repositories.one.gitHubToken).toEqual('bar');
                expect(Settings.repositories.one.someVal).toBe(true);
                expect(Settings.repositories.two.gitHubToken).toEqual('bar2');
                expect(Settings.repositories.two.someVal).toEqual(false);

                expect(Settings.port).toEqual(10);
                expect(Settings.listenPath).toEqual('/foo');
                expect(Settings.secret).toEqual('foo');
                done();
            })
            .catch(function (err) {
                done.fail(err);
            });
    });
});