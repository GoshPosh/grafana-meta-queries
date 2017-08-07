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
    instanceSettings.jsonData = instanceSettings.jsonData || {};

    this.testDatasource = function() {
      return new Promise(function(resolve,reject){
          resolve({ status: "success", message: "Meta Source is working correctly", title: "Success" });
      });
    };


    // Called once per panel (graph)
    this.query = function(options) {
      var datasourceSrv = options.datasourceSrv;
      this.targets = options.targets;

      var dataSource = this;

      console.log("Do query");
      console.log(options);

      var targetsByRefId = {};
      var promises = options.targets.map(function (target) {
        if (target.datasource != dataSource.name) {
          targetsByRefId[target.refId] = target
          var d = $q.defer();
          d.resolve([]);
          return d.promise;
        }
        var opt = angular.copy(options);
        return dataSource._doQuery(opt,  target, datasourceSrv, targetsByRefId);
      });

      return $q.all(promises).then(function(results) {
        return { data: _.flatten(results) };
      });
    };

    this._doQuery = function (options,  target, datasourceSrv, targetsByRefId) {


      var promise = null;

      if (target.queryType === 'TimeShift') {
        var periodsToShift = target.periods;
        var query = target.query;
        var metric = target.metric;
        var outputMetricName = target.outputMetricName;



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
          var outputMetricName = target.outputMetricName;



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
      else {

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
