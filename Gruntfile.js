module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.initConfig({

    clean: ["dist"],

    copy: {
      src_to_dist: {
        cwd: 'src',
        expand: true,
        src: ['**/*', '**/*.js', '!**/*.scss'],
        dest: 'dist'
      },
      pluginDef: {
        expand: true,
        src: ['README.md'],
        dest: 'dist'
      }
    },

    watch: {
      rebuild_all: {
        files: ['src/**/*'],
        tasks: ['watch-ts'],
        options: { spawn: false }
      }
    },

    exec: {
      tsc_build: {
        command: './node_modules/.bin/tsc --module system --target es3 --rootDir dist --outDir dist --declaration --emitDecoratorMetadata --experimentalDecorators --sourceMap dist/config_ctrl.ts dist/module.ts dist/query_ctrl.ts dist/sdk/query_ctrl.ts dist/sdk/sdk.ts'
      },
      tsc_test: {
        command: './node_modules/.bin/tsc --module commonjs --target es5 --rootDir src --outDir dist/test --declaration --emitDecoratorMetadata --experimentalDecorators --sourceMap src/config_ctrl.ts src/module.ts src/query_ctrl.ts src/sdk/query_ctrl.ts src/sdk/sdk.ts'
      }

      // tsc_test_specs: {
      //   command: './node_modules/.bin/tsc --module commonjs --target es5 --outDir dist/test src/spec/**/*.ts'
      // }
    },

    // babel: {
    //   options: {
    //     sourceMap: true,
    //     presets: ['es2015']
    //   },
    //   distTestsSpecsNoSystemJs: {
    //     files: [{
    //       expand: true,
    //       cwd: 'src/spec',
    //       src: ['**/*.js'],
    //       dest: 'dist/test/spec',
    //       ext: '.js'
    //     }]
    //   }
    // },

    // mochaTest: {
    //   test: {
    //     options: {
    //       reporter: 'spec'
    //     },
    //     src: ['dist/test/spec/test-main.js', 'dist/test/spec/*_specs.js']
    //   }
    // }

  });

  grunt.registerTask('default', [
    'clean',
    'copy',
    'exec:tsc_build',
    'exec:tsc_test'
    // 'babel',
    // 'mochaTest'
  ]);

  grunt.registerTask('watch-ts', [
    'clean',
    'copy:src_to_dist',
    'copy:pluginDef',
    'exec:tsc_build'
  ]);
};