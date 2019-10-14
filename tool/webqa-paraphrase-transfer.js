// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const csvparse = require('csv-parse');
const csvstringify = require('csv-stringify');
const Stream = require('stream');
const { DatasetParser, DatasetStringifier } = require('../lib/dataset-parsers');
const { maybeCreateReadStream, readAllLines } = require('./lib/argutils');

const ThingTalk = require('thingtalk');
const Tp = require('thingpedia');
const Ast = ThingTalk.Ast;
const Type = ThingTalk.Type;
const Utils = require('../lib/utils');
const StreamUtils = require('../lib/stream-utils');


const FROM = [
    'restaurant', 'joint', 'cafe', 'cafeteria',
    'places to eat', 'place to eat', 'dining location',
    'dining locale',
    'dining place',
    'dining business',
    'dining businesses',
    'dining establishments',
    'food place',
    'diner',
    'eatery',
    'eateries'

];

const TO = 'hotel';

const BLACKLIST = [
    'servesCuisine', 'priceRange', 'org.schema.Review', 'org.schema:Review'
];

function transfer(utterance, code) {
    // check if the program uses servesCuisine/priceRange
    for (let term of BLACKLIST) {
        if (code.includes(term)) {
            //console.log(code);
            return null;
        }
    }

    // check if `restaurant` is in the sentence
    for (let from of FROM) {
        if (utterance.includes(from))
            utterance = utterance.replace(from, TO);
    }
    if (utterance.includes('food'))
        return null;

    code = code.replace(/org.schema:Restaurant/g, 'org.schema:Hotel')
        .replace(/org.schema.Restaurant/g, 'org.schema.Hotel');

    return [utterance, code];

}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('webqa-paraphrase-transfer', {
            addHelp: true,
            description: "Reduce a WebQA class file to the subset of fields that have data."
        });
        parser.addArgument(['-o', '--output'], {
            required: true,
            type: fs.createWriteStream
        });
        parser.addArgument('--thingpedia', {
            required: true,
            help: 'Path to ThingTalk file containing class definitions.'
        });
        parser.addArgument('input_file', {
            nargs: '+',
            type: maybeCreateReadStream,
            help: 'Input datasets to evaluate (in TSV format); use - for standard input'
        });
    },

    async execute(args) {
        const tpClient = new Tp.FileClient(args);
        const schemas = new ThingTalk.SchemaRetriever(tpClient, null);

        readAllLines(args.input_file)
            .pipe(new DatasetParser())
            .pipe(new Stream.Transform({
                objectMode: true,

                transform(ex, encoding, callback) {
                    //console.log(ex);
                    //const entities = Utils.makeDummyEntities(utterance);
                    //console.log(ex);
                    //console.log(code);
                    //const parsed = ThingTalk.NNSyntax.fromNN(code.split(' '), entities);
                    //console.log(parsed);
                    //process.exit()
                    const result = transfer(ex.preprocessed, ex.target_code);
                    if (result) {
                        const [utterance, code] = result;
                        callback(null, { id: ex.id, preprocessed: utterance, target_code: code });
                    } else {
                        callback(null);
                    }
                },

                flush(callback) {
                    process.nextTick(callback);
                }
            }))
            .pipe(new DatasetStringifier())
            .pipe(args.output);

        return StreamUtils.waitFinish(args.output);
    }
};
