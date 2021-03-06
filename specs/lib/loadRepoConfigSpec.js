'use strict';
var url = require('url');

var Promise = require('bluebird');
var requestPromise = require('request-promise');

var loadRepoConfig = require('../../lib/loadRepoConfig');

describe('loadRepoConfig', function () {
    var configUrl = 'https://config.url/';
    var initialConfig = {
        option: 1,
        option2: 2
    };

    var notFoundResponse = {
        statusCode: 404
    };

    var unexpectedErrorRespomse = {
        statusCode: 201
    };

    var configFileUrl = url.resolve(configUrl, loadRepoConfig._configFile);
    var sampleConfig = {
        option: 'myValue',
        optionList: [1, 2, 3]
    };
    var configFileResponseJson = {
        name: loadRepoConfig.configFile,
        content: Buffer.from(JSON.stringify(sampleConfig)).toString('base64')
    };

    var templatesUrl = url.resolve(configUrl, loadRepoConfig._templateDirectory);
    var templatesResponseJson = [{
        name: 'signature.hbs',
        url: '//file.url'
    }, {
        name: 'issueClosed.hbs',
        url: '//file.url'
    }, {
        name: 'another.json',
        url: '//file.url'
    }];

    var templateUrl = 'https://config.url/templates/';
    var templateContents = 'Here is a template.';
    var templateFileResponseJson = {
        name: 'signature.hbs',
        content: Buffer.from(templateContents, 'ascii').toString('base64'),
        encoding: 'base64'
    };

    it('populates configuration option based on supplied config file and template directory', function (done) {
        spyOn(loadRepoConfig, '_getConfig').and.callFake(function () {
            return Promise.resolve({});
        });
        spyOn(loadRepoConfig, '_getTemplates').and.callFake(function () {
            return Promise.resolve({});
        });

        loadRepoConfig('Org/repo-name', {}, {}).then(function () {
            var expectedUrl = url.resolve('https://api.github.com/repos/Org/repo-name/contents/', loadRepoConfig._configDirectory);

            expect(loadRepoConfig._getConfig).toHaveBeenCalledWith(expectedUrl, {}, {});
            expect(loadRepoConfig._getTemplates).toHaveBeenCalledWith(expectedUrl, {}, {});

            done();
        });
    });

    describe('_getConfig', function () {
        it('requests the expected url', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function (options) {
                if (options.url === configFileUrl) {
                    return Promise.resolve(configFileResponseJson);
                }

                return Promise.reject();
            });

            loadRepoConfig._getConfig(configUrl, {}, initialConfig)
                .then(done)
                .catch(done.fail);
        });

        it('sets configuration for each property in config file', function (done) {
            var sampleHeaders = {};

            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.resolve(configFileResponseJson);
            });

            loadRepoConfig._getConfig(configUrl, sampleHeaders, initialConfig)
                .then(function (config) {
                    expect(config.option).toEqual(sampleConfig.option);
                    expect(config.option2).toEqual(initialConfig.option2);
                    expect(config.optionList).toEqual(sampleConfig.optionList);
                    done();
                })
                .catch(done.fail);
        });

        it ('returns default configuration if there is no template directory', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.reject(notFoundResponse);
            });

            loadRepoConfig._getConfig(configUrl, {}, initialConfig)
                .then(function (config) {
                    expect(config).toEqual(initialConfig);
                    done();
                })
                .catch(done.fail);
        });

        it ('rejects on unexpected error', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.reject(unexpectedErrorRespomse);
            });

            loadRepoConfig._getConfig(configUrl, {}, initialConfig)
                .then(function () {
                    done.fail();
                })
                .catch(done);
        });
    });

    describe('_getTemplates', function () {
        it('requests the expected url', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function (options) {
                if (options.url === templatesUrl) {
                    return Promise.resolve([]);
                }

                return Promise.reject();
            });

            loadRepoConfig._getTemplates(configUrl, {}, initialConfig)
                .then(done)
                .catch(done.fail);
        });

        it('sets template content for each .hbr file', function (done) {
            var sampleHeaders = {};

            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.resolve(templatesResponseJson);
            });

            spyOn(loadRepoConfig, '_getTemplate').and.callFake(function (url, headers) {
                expect(url).toBeDefined();
                expect(headers).toBe(sampleHeaders);
                return Promise.resolve('A template');
            });

            loadRepoConfig._getTemplates(configUrl, sampleHeaders, initialConfig)
                .then(function (config) {
                    expect(config.option).toEqual(initialConfig.option);
                    expect(config.option2).toEqual(initialConfig.option2);
                    expect(config.signatureTemplate).toEqual('A template');
                    expect(config.issueClosedTemplate).toEqual('A template');
                    expect(config.anotherTemplate).toBeUndefined();
                    done();
                })
                .catch(done.fail);
        });

        it ('returns default configuration if there is no template directory', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.reject(notFoundResponse);
            });

            loadRepoConfig._getTemplates(configUrl, {}, initialConfig)
                .then(function (config) {
                    expect(config).toEqual(initialConfig);
                    done();
                })
                .catch(done.fail);
        });

        it ('rejects on unexpected error', function (done) {
            spyOn(requestPromise, 'get').and.callFake(function () {
                return Promise.reject(unexpectedErrorRespomse);
            });

            loadRepoConfig._getTemplates(configUrl, {}, initialConfig)
                .then(function () {
                    done.fail();
                })
                .catch(done);
        });
    });

    it('_getTemplate requests and returns the content of a template file', function (done) {
        spyOn(requestPromise, 'get').and.callFake(function (options) {
            if (options.url === templateUrl) {
                return Promise.resolve(templateFileResponseJson);
            }

            return Promise.reject();
        });

        loadRepoConfig._getTemplate(templateUrl, {})
            .then(function (content) {
                expect(content).toEqual(templateContents);
                done();
            })
            .catch(done.fail);
    });
});
