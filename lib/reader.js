var filters = require('./filters');
var CombinedStream = require('combined-stream');
var eventStream = require('event-stream');
var logger = require('raptor-logging').logger(module);

function readDependency(dependency, context) {
    var contentType = dependency.getContentType();
    
    var input = dependency.read(context);
    input.pause();
    process.nextTick(function() {
        input.resume();
    });

    var filterContext = Object.create(context || {});
    filterContext.contentType = contentType;
    filterContext.dependency = dependency;

    return filters.applyFilters(input, contentType, filterContext);
}

function readBundle(bundle, context) {
    logger.debug("Reading bundle: " + bundle.getKey());

    var dependencies = bundle.getDependencies();

    var combinedStream = CombinedStream.create();

    function handleError(e) {
        combinedStream.emit('error', e);
    }

    dependencies.forEach(function(dependency, i) {
        // Each filter needs its own context since we update the context with the
        // current dependency and each dependency is filtered in parallel
        var readContext = Object.create(context || {});
        readContext.dependency = dependency;
        readContext.bundle = bundle;

        if (i !== 0) {
            // Add a new line as a delimiter between each dependency
            combinedStream.append(eventStream.readArray(['\n']));
        }

        var readDependencyStream = readDependency(dependency, readContext);
        if (typeof readDependencyStream.pipe !== 'function') {
            throw new Error('Invalid stream returned');
        }

        readDependencyStream.on('error', handleError);

        combinedStream.append(readDependencyStream);
    });

    return combinedStream;
}

exports.readDependency = readDependency;
exports.readBundle = readBundle;