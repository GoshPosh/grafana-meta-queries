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
        var periodsToShift = target.periods;
        var query = target.query;
        var metric = target.metric;



        options.range.from._d = dateToMoment(options.range.from, false).add(periodsToShift,'days').toDate();
        options.range.to._d = dateToMoment(options.range.to, false).add(periodsToShift,'days').toDate();
        var metaTarget = angular.copy(targetsByRefId[query]);
        metaTarget.hide = false;
        options.targets = [metaTarget]

        promise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
            return ds.query(options).then(function (result) {
              var datapoints = []
              var data = result.data;
              data.forEach(function (datum) {
                  if(datum.target===metric){
                    datum.datapoints.forEach(function (datapoint) {
                        datapoint[1] = dateToMoment(new Date(datapoint[1]),false).subtract(periodsToShift,'days').toDate().getTime();
                        datapoints.push(datapoint)
                    })
                  }
              });
              return [{
                "target": outputMetricName,
                 "datapoints": datapoints,
                  "hide" : target.hide
              }];
                // var fromMs = formatTimestamp(from);
                // metrics.forEach(function (metric) {
                //     if (!_.isEmpty(metric.datapoints[0]) && metric.datapoints[0][1] < fromMs) {
                //         metric.datapoints[0][1] = fromMs;
                //     }
                // });

            });
          });

      }
      else if (target.queryType === 'MovingAverage') {
          var periodsToShift = target.periods;
          var query = target.query;
          var metric = target.metric;



          options.range.from._d = dateToMoment(options.range.from, false).subtract(periodsToShift-1,'days').toDate();

          var metaTarget = angular.copy(targetsByRefId[query]);
          metaTarget.hide = false;
          options.targets = [metaTarget]

          promise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
              return $q.all([promisesByRefId[query],ds.query(options)]).then(function(results) {
//              when plotting moving average the first data point does not show up. That leaves with broken graph in the beginning.
//              We are calculating actualFrom from the first timestamp from the original promise query and then pushing datapoints whose timestamps that are greater or equal to actualFrom
              if(results[0]['data'][0]['datapoints'][0]==undefined) {
                var actualFrom = null
              }else{
                var actualFrom = results[0]['data'][0]['datapoints'][0][1]
              }
                  var datapoints = []
                  var data = results[1].data;
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

                              if(actualFrom && datapoint[1]>=actualFrom){
                                  datapoints.push([metricSum/periodsToShift,datapoint[1]])
                              }
                          })
                      }
                  });
                  return [{
                      "target": outputMetricName,
                      "datapoints": datapoints,
                      "hide" : target.hide
                  }];
                  // var fromMs = formatTimestamp(from);
                  // metrics.forEach(function (metric) {
                  //     if (!_.isEmpty(metric.datapoints[0]) && metric.datapoints[0][1] < fromMs) {
                  //         metric.datapoints[0][1] = fromMs;
                  //     }
                  // });

              });
          });


      }
      else if (target.queryType === 'Arithmetic') {
          var expression = target.expression;
          var queryLetters = Object.keys(targetsByRefId);

          promise = $q.all(Object.values(promisesByRefId)).then(function(results) {
              var functionArgs = queryLetters.join(', ');
              var functionBody = 'return ('+expression+');';

              var expressionFunction = new Function(functionArgs, functionBody);

              var resultsHash= {};
              for(var i=0;i<results.length;i++){

                  var resultByQuery = results[i];

                  for(var j=0;j<resultByQuery.data.length;j++){
                      var resultByQueryMetric = resultByQuery.data[j];
                      var metricName = resultByQueryMetric.target;
                      if(resultByQueryMetric.datapoints){
                          for(var k=0;k<resultByQueryMetric.datapoints.length;k++){
                              var datapoint = resultByQueryMetric.datapoints[k];
                              resultsHash[datapoint[1]] = resultsHash[datapoint[1]] || [];
                              resultsHash[datapoint[1]][i] = resultsHash[datapoint[1]][i] || {};
                              resultsHash[datapoint[1]][i][metricName] = datapoint[0]
                          }
                      }
                  }

              }
              var datapoints= [];
              Object.keys(resultsHash).forEach(function (datapointTime) {
                  var data = resultsHash[datapointTime];
                  var result = 0;
                  try {
                      result = expressionFunction.apply(this,data)
                  }
                  catch(err) {
                      console.log(err);
                  }
                  datapoints.push([result,parseInt(datapointTime)])

              });


              return [{
                  "target": outputMetricName,
                  "datapoints": datapoints,
                  "hide" : target.hide
              }];
          })
      }


      var dataWrappedPromise =   promise.then(function (metrics) {
          return {
              data: metrics
          }
      });
      promisesByRefId[target.refId] = dataWrappedPromise;
      metaQueryPromises.push(dataWrappedPromise);
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




  }
  return {
      MetaQueriesDatasource: MetaQueriesDatasource
  };
});
