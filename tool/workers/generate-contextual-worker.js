// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const seedrandom = require('seedrandom');
const FileThingpediaClient = require('../lib/file_thingpedia_client');
const { ContextualSentenceGenerator } = require('../../lib/sentence-generator');

module.exports = function worker(args, shard) {
    const tpClient = new FileThingpediaClient(args);
    const options = {
        rng: seedrandom.alea(args.random_seed + ':' + shard),
        idPrefix: shard + ':',
        locale: args.locale,
        flags: args.flags || {},
        templateFile: args.template,
        thingpediaClient: tpClient,
        maxDepth: args.maxdepth,
        debug: args.debug,
        algorithm: args.algorithm
    };
    return new ContextualSentenceGenerator(options);
};
