/*
 * Copyright 2014-2015 Quantiply Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
define([
  'angular',
  'lodash',
  'app/core/utils/datemath',
  'moment',
],
function (angular, _, dateMath, moment) {
  'use strict';

  /** @ngInject */
  function MetaQueriesDatasource($q, datasourceSrv) {
    this.datasourceSrv = datasourceSrv;
    this.$q = $q;

    this.testDatasource = function() {
      return new Promise(function(resolve,reject){
          resolve({ status: "success", message: "Meta Source is working correctly", title: "Success" });
      });
    };


    // Called once per panel (graph)
    this.query = function(options) {
      console.log("Do query");
      console.log(options);

      var _this = this;
      var sets = _.groupBy(options.targets, 'datasource');
      var promisesByRefId = {};
      var promises = [];
      var targetsByRefId = {};
      _.forEach(sets, function (targets, dsName) {
        var promise = null;
        var opt = angular.copy(options);

        if (dsName === _this.name) {
          promise = _this._doQuery(targets, promisesByRefId, opt, targetsByRefId);
        }
        else{
          promise = _this.datasourceSrv.get(dsName).then(function (ds) {
            opt.targets = targets;
            return ds.query(opt);
          });
        }


        _.forEach(targets,function(target){
          var  nonHiddenTargetPromise = promise;
          if(dsName !== _this.name && target.hide===true){
              nonHiddenTargetPromise = _this.datasourceSrv.get(dsName).then(function (ds) {
                  var nonHiddenTarget = angular.copy(target);
                  nonHiddenTarget.hide = false;
                  opt.targets = [nonHiddenTarget];
                  return ds.query(opt);
              });
          }
          promisesByRefId[target.refId] = nonHiddenTargetPromise;
          targetsByRefId[target.refId] = target
        });
        promises.push(promise)
      });

      return this.$q.all(promises).then(function (results) {
          return { data: _.flatten(_.filter(_.map(results, function (result) {
              var data = result.data;
              if(data){
                  data = _.filter(result.data,function(datum){
                      return datum.hide!==true;
                  })
              }
              return data;
          }),function(result){return result!==undefined && result!==null})) };
      });

    };

    this._doQuery = function (targets, promisesByRefId, opt, targetsByRefId) {

      var metaQueryPromises = [];

      _.forEach(targets,function (target) {

      var options = angular.copy(opt);

      var promise = null;

      var outputMetricName = target.outputMetricName;

      if (target.queryType === 'TimeShift') {
          promise = timeshift(target, options, targetsByRefId, datasourceSrv, outputMetricName).then(function(results){
              return promisesByRefId[results.root_query].then(function(root_query_results){
                   return filter_datapoints(target, outputMetricName, results, root_query_results)
              })
          })


      }
      else if (target.queryType === 'MovingAverage') {
          promise = moving_average(target, options, targetsByRefId, datasourceSrv, outputMetricName).then(function(results){
              return promisesByRefId[results.root_query].then(function(root_query_results){
                 return filter_datapoints(target, outputMetricName, results, root_query_results)
              })
          })

      }
      else if (target.queryType === 'Arithmetic') {
          var expression = target.expression || '';
          var queryLetters = Object.keys(targetsByRefId).filter(x => expression.indexOf(x + '[') !== -1);
          var queryPromises = [];

          queryLetters.forEach(function(queryLetter) {
              queryPromises.push(promisesByRefId[queryLetter]);
          });

          promise = $q.all(queryPromises).then(function(results) {
            return arithmetic(target, targetsByRefId, outputMetricName, results)
          });

      }


      promisesByRefId[target.refId] = promise;
      metaQueryPromises.push(promise);
      targetsByRefId[target.refId]= target;

      });

        return this.$q.all(metaQueryPromises).then(function (results) {
            return { data: _.flatten(_.map(results, 'data')) };
        });

    };


    function dateToMoment(date, roundUp) {
      if (date === 'now') {
        return moment();
      }
      date = dateMath.parse(date, roundUp);
      return moment(date.valueOf());
    }



    function moving_average(target, options, targetsByRefId, datasourceSrv, outputMetricName){
        var promise = null;
        var metaTargetPromise = null;
        var periodsToShift = target.periods;
        var query = target.query;
        var metric = target.metric;



        options.range.from._d = dateToMoment(options.range.from, false).subtract(periodsToShift-1,'days').toDate();

        var metaTarget = angular.copy(targetsByRefId[query]);
        metaTarget.hide = false;
        options.targets = [metaTarget]

        metaTargetPromise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
            if(ds.constructor.name === "MetaQueriesDatasource" && targetsByRefId[query].queryType=="MovingAverage"){
                return moving_average(options.targets[0], options, targetsByRefId, datasourceSrv, metaTarget.outputMetricName)
            }
            if(ds.constructor.name === "MetaQueriesDatasource" && targetsByRefId[query].queryType=="TimeShift"){
                return timeshift(options.targets[0], options, targetsByRefId, datasourceSrv, metaTarget.outputMetricName)
            }
            else{
                return ds.query(options)
            }
        });
        promise  = metaTargetPromise.then(function (result) {
                var datapoints = []
                var data = result.data;
                data.forEach(function (datum) {
                    if(datum.target===metric){
                        var datapointByTime = {};
                        datum.datapoints.forEach(function (datapoint) {
                            datapointByTime[datapoint[1]] = datapoint[0];

                            var metricSum = 0;
                            for(var count = 0; count < periodsToShift; count++) {
                                var targetDate = dateToMoment(new Date(datapoint[1]),false).subtract(count,'days').toDate().getTime()
                                metricSum += datapointByTime[targetDate] || 0
                            }

                            datapoints.push([metricSum/periodsToShift,datapoint[1]])
                        })
                    }
                });
                return {
                    data: [{
                        "target": outputMetricName,
                        "datapoints": datapoints,
                        "hide" : target.hide
                    }],
                    root_query: result.root_query || query
                };
                // var fromMs = formatTimestamp(from);
                // metrics.forEach(function (metric) {
                //     if (!_.isEmpty(metric.datapoints[0]) && metric.datapoints[0][1] < fromMs) {
                //         metric.datapoints[0][1] = fromMs;
                //     }
                // });

            });
        return promise;
    }

    function timeshift(target, options, targetsByRefId, datasourceSrv, outputMetricName){

        var promise = null;
        var metaTargetPromise = null;
        var periodsToShift = target.periods;
        var query = target.query;
        var metric = target.metric;
        var timeshiftUnit = target.timeshiftUnit;

        options.range.from._d = dateToMoment(options.range.from, false).add(periodsToShift,timeshiftUnit).toDate();
        options.range.to._d = dateToMoment(options.range.to, false).add(periodsToShift,timeshiftUnit).toDate();

        var metaTarget = angular.copy(targetsByRefId[query]);
        metaTarget.hide = false;
        options.targets = [metaTarget]

        metaTargetPromise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
            if(ds.constructor.name === "MetaQueriesDatasource" && targetsByRefId[query].queryType=="TimeShift"){
                return timeshift(options.targets[0], options, targetsByRefId, datasourceSrv, metaTarget.outputMetricName)
            }
            if(ds.constructor.name === "MetaQueriesDatasource" && targetsByRefId[query].queryType=="MovingAverage"){
                return moving_average(options.targets[0], options, targetsByRefId, datasourceSrv, metaTarget.outputMetricName)
            }

            else{
                return ds.query(options)
            }
        });

        promise = metaTargetPromise.then(function (result) {
              var datapoints = []
              var data = result.data;
              data.forEach(function (datum) {
                  if(datum.target===metric){
                    datum.datapoints.forEach(function (datapoint) {
                        datapoint[1] = dateToMoment(new Date(datapoint[1]),false).subtract(periodsToShift,timeshiftUnit).toDate().getTime();
                        datapoints.push(datapoint)
                    })
                  }
              });
                return {
                    data: [{
                        "target": outputMetricName,
                        "datapoints": datapoints,
                        "hide": target.hide
                    }],
                    root_query: result.root_query || query
                };
                // var fromMs = formatTimestamp(from);
                // metrics.forEach(function (metric) {
                //     if (!_.isEmpty(metric.datapoints[0]) && metric.datapoints[0][1] < fromMs) {
                //         metric.datapoints[0][1] = fromMs;
                //     }
                // });

            });
        return promise;
    }

    function arithmetic(target, targetsByRefId, outputMetricName, results){

        var expression = target.expression || '';
        var queryLetters = Object.keys(targetsByRefId).filter(x => expression.indexOf(x + '[') !== -1);

        var functionArgs = queryLetters.join(', ');
        var functionBody = 'return ('+expression+');';
        var expressionFunction = new Function(functionArgs, functionBody);
        var resultsHashMap = {};
        var resultsTotalList = [];

        for (var i = 0; i < results.length; i++) {
            var resultByQuery = results[i];
            var resultByQueryDataLength = resultByQuery.data.length;

            for (var j = 0; j < resultByQueryDataLength; j++) {
                var resultByQueryMetric = resultByQuery.data[j];
                var metricName = resultByQueryMetric.target;

                // default no group by
                var resultsTitle = outputMetricName;

                if (resultByQueryMetric.props) {
                    var groupByValues = Object.values(resultByQueryMetric.props);

                    if (groupByValues instanceof Array && groupByValues.length > 0) {
                        resultsTitle = groupByValues[0];
                    }
                }

                if (!!!resultsHashMap[resultsTitle]) {
                    resultsHashMap[resultsTitle] = {};
                }

                var dstTitleData = resultsTotalList.find(x => x.id === resultsTitle);

                if (!dstTitleData) {
                    dstTitleData = {
                        id: resultsTitle,
                        value: []
                    };
                    resultsTotalList.push(dstTitleData);
                }

                var resultsHash = resultsHashMap[resultsTitle];

                if (resultByQueryMetric.datapoints) {
                    var metricMap = {};
                    metricMap[metricName] = 0;

                    for (var k = 0; k < resultByQueryMetric.datapoints.length; k++) {
                        var datapoint = resultByQueryMetric.datapoints[k];
                        resultsHash[datapoint[1]] = resultsHash[datapoint[1]] || [];
                        resultsHash[datapoint[1]][i] = resultsHash[datapoint[1]][i] || {};
                        resultsHash[datapoint[1]][i][metricName] = datapoint[0];
                        metricMap[metricName] += datapoint[0];
                    }

                    dstTitleData.value.push(metricMap);
                }
            }
        }

        var orderType = target.orderType;
        var orderSize = target.orderSize;
        var resultTitles = Object.keys(resultsHashMap);

        if (!(resultTitles.length === 1 && resultTitles[0] === outputMetricName)) {
            resultTitles = [];
            // compute by group name
            resultsTotalList.forEach(function(resultTotal) {
                var result = 0;

                try {
                    result = expressionFunction.apply(this, resultTotal.value);
                } catch(err) {
                    console.log(err);
                }

                resultTotal.value = result;
            });

            // sort results
            resultsTotalList.sort(function(obj1, obj2) {
                var val1 = obj1.value;
                var val2 = obj2.value;

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
                for (var i = resultsTotalList.length - 1, l = resultsTotalList.length - orderSize - 1; i > l; i--) {
                    resultTitles.push(resultsTotalList[i].id);
                }
            } else {
                for (var i = 0; i < orderSize; i++) {
                    resultTitles.push(resultsTotalList[i].id);
                }
            }
        }

        var metaResults = [];

        resultTitles.forEach(function(resultsHashTitle) {
            var resultsHash = resultsHashMap[resultsHashTitle];
            var datapoints = [];

            Object.keys(resultsHash).forEach(function(datapointTime) {
                var data = resultsHash[datapointTime];
                var result = 0;

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

        return {
            data: metaResults
        };
    }

    function filter_datapoints(target, outputMetricName, results, root_query_results){

         var datapoints = []
         var actualFrom = null
         if(root_query_results['data'][0]['datapoints'][0]!=undefined) {
          actualFrom = root_query_results['data'][0]['datapoints'][0][1]
         }
         results.data.forEach(function (datum) {
           datum.datapoints.forEach(function (datapoint) {
             if(actualFrom && datapoint[1]>=actualFrom)
                datapoints.push(datapoint)
           })
          })

         return {
           data: [{
             "target": outputMetricName,
             "datapoints": datapoints,
             "hide" : target.hide
            }]
         }

    }


  }
  return {
      MetaQueriesDatasource: MetaQueriesDatasource
  };
});
