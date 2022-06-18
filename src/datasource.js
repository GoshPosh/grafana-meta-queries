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

    // cant use angular.copy because of https://github.com/angular/angular.js/issues/8726
    function simpleHashCopyForPromises(object){
        var copiedObject = {};
        Object.keys(object).forEach(function (key) {
            copiedObject[key] = object[key]
        });
        return copiedObject;
    }

    // Called once per panel (graph)
    this.query = function(options) {
      console.log("Do query");
      console.log(options);

      // Replace the template variable in expression with its current value
      options["targets"].forEach(function (target) {
        if (target.hasOwnProperty("expression")) {
            var expression = target.expression;
            if (expression.indexOf("$") >= 0) {
              var variables = datasourceSrv["templateSrv"]["variables"];
              Object.keys(variables).sort().reverse() // Greedy matching
              .forEach(function(key) {
                var variable = "$" + variables[key]["name"];
                if (expression.indexOf(variable) >= 0) {
                  expression = expression.replace(variable, variables[key]["current"]["value"]);
                  target.expression = expression;
                }
              });
            }
        }
      });

      var _this = this;
      var promisesByRefId = {};
      var promises = [];
      var targetsByRefId = {};
      var sets;

     if (typeof (options.targets[0].datasource) === 'object') {
        sets = _.groupBy(options.targets, target => target.datasource.uid);
      } else {
        sets = _.groupBy(options.targets, 'datasource');
      }
      _.forEach(sets, function (targets, dsName) {
      // Grafana (8.x.x) sends datasource name as undefined with mixed plugin made as default datasource
      // https://github.com/grafana/grafana/issues/36508
        if(dsName=="undefined"){
            dsName=_this.datasourceSrv.defaultName
        }
        var promise = null;
        var opt = angular.copy(options);
        var _promisesByRefId = simpleHashCopyForPromises(promisesByRefId);
        var _targetsByRefId = simpleHashCopyForPromises(targetsByRefId);

        //grafana 7.x requires ds_res as promise. Since older plugins doesnt converts to promise, added ds_res.toPromise().
        promise = _this.datasourceSrv.get(dsName).then(function (ds) {
          if (ds.meta.id === _this.meta.id) {
              return _this._doQuery(targets, _promisesByRefId, opt, _targetsByRefId)
          }
          else{
              opt.targets = targets;
              var ds_res = ds.query(opt);
              if(ds_res.then){
                return ds_res;
                }
              else{
                return ds_res.toPromise();
               }
          }

        });

        //grafana 7.x requires ds_res as promise. Since older plugins doesnt converts to promise, added ds_res.toPromise().
        _.forEach(targets,function(target){
          var  nonHiddenTargetPromise = promise;
          if(target.hide===true){
              nonHiddenTargetPromise = _this.datasourceSrv.get(dsName).then(function (ds) {
                  if (ds.meta.id !== _this.meta.id) {
                      var nonHiddenTarget = angular.copy(target);
                      nonHiddenTarget.hide = false;
                      opt.targets = [nonHiddenTarget];
                      var ds_res = ds.query(opt);
                      if(ds_res.then){
                        return ds_res;
                        }
                      else{
                        return ds_res.toPromise();
                        }
                  }
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

          promise = $q.all(Object.values(promisesByRefId)).then(function(results) {
            return arithmetic(target, targetsByRefId, outputMetricName, results, options)
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
                var ds_res = ds.query(options);
                if(ds_res.then){
                    return ds_res;
                }
                else{
                    return ds_res.toPromise();
                }
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

        if(!timeshiftUnit)
            timeshiftUnit="days"

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
                var ds_res = ds.query(options);
                if(ds_res.then){
                    return ds_res;
                }
                else{
                    return ds_res.toPromise();
                }
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

    function arithmetic(target, targetsByRefId, outputMetricName, results, options){

          var expression = target.expression;
          var queryLetters = Object.keys(targetsByRefId);
          // Clean out strings from expression to make letters easier to find
          var temp = expression.replace(/(['"])(?:[^\\\1]|\\.)*?\1/g, '$1$1');
          // Regular expression to find letters in the expression
          var findLetter = new RegExp('(^|[^A-Za-z0-9_.])['+queryLetters.join("")+'](?=[^A-Za-z0-9_]|$)', 'g');
          // Extract letters used in the expression
          var expressionLetters = temp.match(findLetter).map(function(v){return v.slice(-1);}).
                                                         filter(function(v,i,a){return a.indexOf(v)===i;});

          var functionArgs = ["scopedVars"].concat(queryLetters).join(', ');
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
                          resultsHash[datapoint[1]][i][metricName] = datapoint[0];
                          if (resultByQueryMetric.datapoints[k ? k : 1]) {
                              var timepoint = resultByQueryMetric.datapoints[k ? k : 1][1];
                              var prevpoint = resultByQueryMetric.datapoints[k ? k-1 : 0][1];
                              resultsHash[datapoint[1]][i]["__time_delta"] = timepoint - prevpoint;
                          } else {
                              resultsHash[datapoint[1]][i]["__time_delta"] = 1
                          }
                      }
                  }
              }
          }

          var datapoints= [];
          Object.keys(resultsHash).sort(function(a,b){return a-b;}).forEach(function(datapointTime){
              var data = [options.scopedVars].concat(resultsHash[datapointTime]);
              // Check that all required letters are defined in this sample
              if (queryLetters.reduce(function(a,d,i){return a && (!(expressionLetters.includes(d)) ||
                                                                   (typeof data[i+1] !== 'undefined'));},
                                      true) &&
                  datapointTime >= dateToMoment(options.range.from, true).valueOf() &&
                  datapointTime <= dateToMoment(options.range.to, false).valueOf()) {
                  try {
                      var result = expressionFunction.apply(this,data);
                      datapoints.push([result,parseInt(datapointTime)]);
                  }
                  catch(err) {
                      console.log(err);
                  }
              }

          });
          if (!datapoints.length) {
              if (expressionLetters.length) {
                  console.log("Expression '"+expression+"' results in no data, do letters " +
                              expressionLetters.join() + " all exist?");
              } else {
                  console.log("Expression '"+expression+"' uses no letters and results in no data?");
              }
          }

          return {
              data: [{
                  "target": outputMetricName,
                  "datapoints": datapoints,
                  "hide" : target.hide
              }]
          }
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
