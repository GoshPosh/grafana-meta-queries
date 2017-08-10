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
  function MetaQueriesDatasource(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.$q = $q;
    instanceSettings.jsonData = instanceSettings.jsonData || {};

    // TODO find better way to do this
    //Hack to get datasourceSrv
    this.datasourceSrv = angular.element('body').injector().get('datasourceSrv');

    this.testDatasource = function() {
      return new Promise(function(resolve,reject){
          resolve({ status: "success", message: "Meta Source is working correctly", title: "Success" });
      });
    };


    // Called once per panel (graph)
    this.query = function(options) {
      var datasourceSrv = this.datasourceSrv;
      var panelTargets = options.panelTargets;
      var dataSource = this;

      console.log("Do query");
      console.log(options);

      var targetsByRefId = {};
      for(var i=0;i<panelTargets.length;i++){
        var target = panelTargets[i];
        if (target.refId === options.targets[0].refId) {
            break;
        }
            // Might need datasource specific unhides
          if(target.druidDS) {
              if (target.currentAggregator) {
                  for (var i = 0; i < target.currentAggregator.length; i++) {
                      target.currentAggregator[i].hidden = false;
                  }
              }
              if (target.aggregators) {
                  for (var i = 0; i < target.aggregators.length; i++) {
                      target.aggregators[i].hidden = false;
                  }
              }
          }
          targetsByRefId[target.refId] = target
        }
      var promises = options.targets.map(function(target){
        var opt = angular.copy(options);
        return dataSource._doQuery(opt,  target, datasourceSrv, targetsByRefId);
      });

      return $q.all(promises).then(function(results) {
        return { data: _.flatten(results) };
      });
    };

    this._doQuery = function (options,  target, datasourceSrv, targetsByRefId) {


      var promise = null;

      var outputMetricName = target.outputMetricName;
      if (target.queryType === 'TimeShift') {
        var periodsToShift = target.periods;
        var query = target.query;
        var metric = target.metric;



        options.range.from._d = dateToMoment(options.range.from, false).add(periodsToShift,'days').toDate();
        options.range.to._d = dateToMoment(options.range.to, false).add(periodsToShift,'days').toDate();
        options.targets = [targetsByRefId[query]]

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
                 "datapoints": datapoints
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



          var actualFrom = options.range.from._d.getTime()
          options.range.from._d = dateToMoment(options.range.from, false).subtract(periodsToShift,'days').toDate();

          options.targets = [targetsByRefId[query]]

          promise = datasourceSrv.get(options.targets[0].datasource).then(function(ds) {
              return ds.query(options).then(function (result) {
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

                              if(datapoint[1]>=actualFrom){
                                  datapoints.push([metricSum/periodsToShift,datapoint[1]])
                              }
                          })
                      }
                  });
                  return [{
                      "target": outputMetricName,
                      "datapoints": datapoints
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
          var promises= [], queryLetters = [];

          for(var i=0;i<options.targets.length;i++){
              if(options.targets[i].refId==target.refId){
                  break
              }
              queryLetters.push(options.targets[i].refId);
              promises.push(datasourceSrv.get(options.targets[i].datasource).then(function(ds) {
                  return ds.query(options)
              }))

          }
          promise = this.$q.all(promises).then(function(results) {
              var functionArgs = queryLetters.join(', ');
              var functionBody = 'return ('+expression+');';

              var expressionFunction = new Function(functionArgs, functionBody);

              var resultsHash= {};
              for(var i=0;i<results.length;i++){

                  var resultByQuery = results[i];

                  for(var j=0;j<resultByQuery.data.length;j++){
                      var resultByQueryMetric = resultByQuery.data[j];
                      var metricName = resultByQueryMetric.target;
                      for(var k=0;k<resultByQueryMetric.datapoints.length;k++){
                          var datapoint = resultByQueryMetric.datapoints[k];
                          resultsHash[datapoint[1]] = resultsHash[datapoint[1]] || [];
                          resultsHash[datapoint[1]][i] = resultsHash[datapoint[1]][i] || {};
                          resultsHash[datapoint[1]][i][metricName] = datapoint[0]
                      }
                  }

              }
              var datapoints= [];
              Object.keys(resultsHash).forEach(function (datapointTime) {
                  datapoints.push([expressionFunction.apply(this,resultsHash[datapointTime]),parseInt(datapointTime)])
              });


              return [{
                  "target": outputMetricName,
                  "datapoints": datapoints
              }];
          })
      }

      return promise.then(function (metrics) {
        return metrics;
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
