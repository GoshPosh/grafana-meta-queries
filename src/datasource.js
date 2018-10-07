define(['angular', 'lodash', 'app/core/utils/datemath', 'moment'], function(angular, _, dateMath, moment) {
    'use strict';

    function dateToMoment(date, roundUp) {
        if (date === 'now') {
            return moment();
        }
        date = dateMath.parse(date, roundUp);
        return moment(date.valueOf());
    }

    function MetaQueriesDatasource($q, datasourceSrv) {
        this.datasourceSrv = datasourceSrv;
        this.$q = $q;

        this.testDatasource = function() {
            return new Promise(function(resolve) {
                resolve({status: 'success', message: 'Meta Source is working correctly', title: 'Success'});
            });
        };

        // Called once per panel (graph)
        this.query = function(options) {
            let _this = this;
            let sets = _.groupBy(options.targets, 'datasource');
            let promisesByRefId = {};
            let promises = [];
            let targetsByRefId = {};

            _.forEach(sets, function(targets, dsName) {
                let promise = null;
                let opt = angular.copy(options);

                if (dsName === _this.name) {
                    promise = _this._doQuery(targets, promisesByRefId, opt, targetsByRefId);
                } else{
                    promise = _this.datasourceSrv.get(dsName).then(function(ds) {
                        opt.targets = targets;
                        return ds.query(opt);
                    });
                }

                _.forEach(targets, function(target) {
                    let nonHiddenTargetPromise = promise;
                    if (dsName !== _this.name && target.hide === true) {
                        nonHiddenTargetPromise = _this.datasourceSrv.get(dsName).then(function (ds) {
                            let nonHiddenTarget = angular.copy(target);
                            nonHiddenTarget.hide = false;
                            opt.targets = [nonHiddenTarget];
                            return ds.query(opt);
                        });
                    }

                    promisesByRefId[target.refId] = nonHiddenTargetPromise;
                    targetsByRefId[target.refId] = target;
                });

                promises.push(promise);
            });

            return this.$q.all(promises).then(function(results) {
                return {
                    data: _.flatten(_.filter(_.map(results, function(result) {
                        let data = result.data;

                        if (data) {
                            data = _.filter(result.data, function(datum) {
                                return datum.hide !== true;
                            });
                        }

                        return data;
                    }), function(result) {
                        return result !== undefined && result !== null;
                    }))
                };
            });
        };

        this._doQuery = function(targets, promisesByRefId, opt, targetsByRefId) {
            let metaQueryPromises = [];

            _.forEach(targets, function(target) {
                let options = angular.copy(opt);
                let promise = null;
                let outputMetricName = target['outputMetricName'];

                if (target.queryType === 'TimeShift') {
                    let periodsToShift = target.periods;
                    let query = target.query;
                    let metric = target.metric;
                    options.range.from._d = dateToMoment(options.range.from, false).add(periodsToShift,'days').toDate();
                    options.range.to._d = dateToMoment(options.range.to, false).add(periodsToShift,'days').toDate();
                    let metaTarget = angular.copy(targetsByRefId[query]);
                    metaTarget.hide = false;
                    options.targets = [metaTarget];

                    promise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
                        return ds.query(options).then(function(result) {
                            let datapoints = [];
                            let data = result.data;

                            data.forEach(function(datum) {
                                if (datum.target === metric) {
                                    datum.datapoints.forEach(function(datapoint) {
                                        datapoint[1] = dateToMoment(new Date(datapoint[1]), false).subtract(periodsToShift, 'days').toDate().getTime();
                                        datapoints.push(datapoint);
                                    });
                                }
                            });

                            return [{
                                'target': outputMetricName,
                                'datapoints': datapoints,
                                'hide': target.hide
                            }];
                        });
                    });
                } else if (target.queryType === 'MovingAverage') {
                    let periodsToShift = target.periods;
                    let query = target.query;
                    let metric = target.metric;
                    options.range.from._d = dateToMoment(options.range.from, false).subtract(periodsToShift-1,'days').toDate();
                    let metaTarget = angular.copy(targetsByRefId[query]);
                    metaTarget.hide = false;
                    options.targets = [metaTarget];

                    promise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
                        return $q.all([promisesByRefId[query], ds.query(options)]).then(function(results) {
                            let actualFrom = null;

                            if (results[0]['data'][0]['datapoints'][0]) {
                                actualFrom = results[0]['data'][0]['datapoints'][0][1];
                            }

                            let datapoints = [];
                            let data = results[1].data;

                            data.forEach(function(datum) {
                                if (datum.target === metric) {
                                    let datapointByTime = {};

                                    datum.datapoints.forEach(function(datapoint) {
                                        datapointByTime[datapoint[1]] = datapoint[0];
                                        let metricSum = 0;

                                        for (let count = 0; count < periodsToShift; count++) {
                                            let targetDate = dateToMoment(new Date(datapoint[1]), false).subtract(count,'days').toDate().getTime();
                                            metricSum += datapointByTime[targetDate] || 0;
                                        }

                                        if (actualFrom && datapoint[1] >= actualFrom) {
                                            datapoints.push([metricSum/periodsToShift, datapoint[1]]);
                                        }
                                    });
                                }
                            });

                            return [{
                                'target': outputMetricName,
                                'datapoints': datapoints,
                                'hide': target.hide
                            }];
                        });
                    });
                } else if (target.queryType === 'Arithmetic') {
                    let expression = target.expression || '';
                    let queryLetters = Object.keys(targetsByRefId).filter(x => expression.indexOf(x + '[') !== -1);
                    let queryPromises = [];

                    queryLetters.forEach(function(queryLetter) {
                        queryPromises.push(promisesByRefId[queryLetter]);
                    });

                    promise = $q.all(queryPromises).then(function(results) {
                        let functionArgs = queryLetters.join(', ');
                        let functionBody = 'return ('+expression+');';
                        let expressionFunction = new Function(functionArgs, functionBody);
                        let resultsHashMap = {};
                        let resultsTotalList = [];

                        for (let i = 0; i < results.length; i++) {
                            let resultByQuery = results[i];
                            let resultByQueryDataLength = resultByQuery.data.length;

                            for (let j = 0; j < resultByQueryDataLength; j++) {
                                let resultByQueryMetric = resultByQuery.data[j];
                                let metricName = resultByQueryMetric.target;

                                // 默认没有group by
                                let resultsTitle = outputMetricName;

                                if (resultByQueryMetric.props) {
                                    let groupByValues = Object.values(resultByQueryMetric.props);

                                    if (groupByValues instanceof Array && groupByValues.length > 0) {
                                        resultsTitle = groupByValues[0];
                                    }
                                }

                                if (!!!resultsHashMap[resultsTitle]) {
                                    resultsHashMap[resultsTitle] = {};
                                }

                                let dstTitleData = resultsTotalList.find(x => x.id === resultsTitle);

                                if (!dstTitleData) {
                                    dstTitleData = {
                                        id: resultsTitle,
                                        value: []
                                    };
                                    resultsTotalList.push(dstTitleData);
                                }

                                let resultsHash = resultsHashMap[resultsTitle];

                                if (resultByQueryMetric.datapoints) {
                                    let metricMap = {};
                                    metricMap[metricName] = 0;

                                    for (let k = 0; k < resultByQueryMetric.datapoints.length; k++) {
                                        let datapoint = resultByQueryMetric.datapoints[k];
                                        resultsHash[datapoint[1]] = resultsHash[datapoint[1]] || [];
                                        resultsHash[datapoint[1]][i] = resultsHash[datapoint[1]][i] || {};
                                        resultsHash[datapoint[1]][i][metricName] = datapoint[0];
                                        metricMap[metricName] += datapoint[0];
                                    }

                                    dstTitleData.value.push(metricMap);
                                }
                            }
                        }

                        let orderType = target.orderType;
                        let orderSize = target.orderSize;
                        let resultTitles;

                        if (orderSize > 0 && queryLetters && queryLetters.length > 1) {
                            resultTitles = [];
                            // 计算各个分组这段时间的总的结果
                            resultsTotalList.forEach(function(resultTotal) {
                                let result = 0;

                                try {
                                    result = expressionFunction.apply(this, resultTotal.value);
                                } catch(err) {
                                    console.log(err);
                                }

                                resultTotal.value = result;
                            });

                            // 对分组结果排序
                            resultsTotalList.sort(function(obj1, obj2) {
                                let val1 = obj1.value;
                                let val2 = obj2.value;

                                if (val1 < val2) {
                                    return -1;
                                } else if (val1 > val2) {
                                    return 1;
                                } else {
                                    return 0;
                                }
                            });

                            if (orderSize > resultsTotalList.length) {
                                orderSize = resultsTotalList.length;
                            }

                            if (orderType === 'Top') {
                                for (let i = resultsTotalList.length - 1, l = resultsTotalList.length - orderSize - 1; i > l; i--) {
                                    resultTitles.push(resultsTotalList[i].id);
                                }
                            } else {
                                for (let i = 0; i < orderSize; i++) {
                                    resultTitles.push(resultsTotalList[i].id);
                                }
                            }
                        } else {
                            resultTitles = Object.keys(resultsHashMap);
                        }

                        let metaResults = [];

                        resultTitles.forEach(function(resultsHashTitle) {
                            let resultsHash = resultsHashMap[resultsHashTitle];
                            let datapoints = [];

                            Object.keys(resultsHash).forEach(function(datapointTime) {
                                let data = resultsHash[datapointTime];
                                let result = 0;

                                try {
                                    result = expressionFunction.apply(this,data);
                                } catch(err) {
                                    console.log(err);
                                }

                                datapoints.push([result,parseInt(datapointTime)]);
                            });

                            metaResults.push({
                                'target': resultsHashTitle,
                                'datapoints': datapoints,
                                'hide': target.hide
                            });
                        });

                        return metaResults;
                    });
                }

                let dataWrappedPromise = promise.then(function (metrics) {
                    return {
                        data: metrics
                    };
                });

                promisesByRefId[target.refId] = dataWrappedPromise;
                metaQueryPromises.push(dataWrappedPromise);
                targetsByRefId[target.refId]= target;
            });

            return this.$q.all(metaQueryPromises).then(function (results) {
                return {data: _.flatten(_.map(results, 'data'))};
            });
        };
    }

    return {
        'MetaQueriesDatasource': MetaQueriesDatasource
    };
});