'use strict';

var Promise = require('bluebird');
var requestPromise = require('request-promise');

var Settings = require('../lib/Settings');

module.exports = stalePullRequest;

if (require.main === module) {
    Settings.loadRepositoriesSettings('./config.json')
        .then(function () {
            return stalePullRequest(Settings.repositories);
        })
        .catch(function (err) {
            console.error(err);
        });
}

/**
 * Bumps stale pull requests for all configured repositories.
 *
 * @param {Object} repositories The Settings.repositories object.
 * @returns {Promise} A promise that resolves when the process is complete.
 */
function stalePullRequest(repositories) {
    return Promise.each(Object.keys(repositories), function (repositoryName) {
        var repositorySettings = repositories[repositoryName];
        return stalePullRequest._processRepository(repositoryName, repositorySettings)
            .catch(function (error) {
                //Eat the error here so that all repositories are processed.
                console.error(error);
            });
    });
}

/** Implementation
 *
 * @param {String} repositoryName Base url to list pull requests https://developer.github.com/v3/pulls/#list-pull-requests
 * @param {RepositorySettings} repositorySettings The repository settings
 * @return {Promise<Array<http.IncomingMessage | undefined>>} Promise to an array of incoming messages
 */
stalePullRequest._processRepository = function (repositoryName, repositorySettings) {
    return requestPromise.get({
        url: 'https://api.github.com/repos/' + repositoryName + '/pulls?state=opened&base=master',
        headers: repositorySettings.headers,
        json: true
    })
        .then(function (pullRequestsJsonResponse) {
            return Promise.each(pullRequestsJsonResponse, function (pullRequest) {
                return stalePullRequest._processPullRequest(pullRequest, repositorySettings);
            });
        });
};

stalePullRequest._processPullRequest = function (pullRequest, repositorySettings) {
    var commentsUrl = pullRequest.comments_url;
    // Check if last post was cesium-concierge
    return requestPromise.get({
        url: commentsUrl,
        headers: repositorySettings.headers,
        json: true
    })
        .then(function (commentsJsonResponse) {
            var latestCommentCreatedAt = commentsJsonResponse[commentsJsonResponse.length - 1].created_at;
            if (stalePullRequest.daysSince(new Date(latestCommentCreatedAt)) >= repositorySettings.maxDaysSinceUpdate) {
                var alreadyBumped = false;
                commentsJsonResponse.forEach(function (comment) {
                    if (comment.user.login === 'cesium-concierge') {
                        alreadyBumped = true;
                    }
                });
                var template = alreadyBumped ? repositorySettings.secondaryStalePullRequestTemplate : repositorySettings.initialStalePullRequestTemplate;

                return requestPromise.post({
                    url: commentsUrl,
                    headers: repositorySettings.headers,
                    body: {
                        body: template({
                            maxDaysSinceUpdate: repositorySettings.maxDaysSinceUpdate
                        })
                    },
                    json: true
                });
            }
        });
};

stalePullRequest.daysSince = function (date) {
    var msPerDay = 24 * 60 * 60 * 1000;
    return (Date.now() - date.getTime()) / msPerDay;
};