///<reference path="../headers/common.d.ts" />

import angular from 'angular';
import _ from 'lodash';

class MixedDatasource {

  /** @ngInject */
  constructor(private $q, private datasourceSrv) {
    debugger;
  }

  query(options) {
    debugger;
    return {"data":[]}
  }
}

export {MixedDatasource, MixedDatasource as Datasource};
