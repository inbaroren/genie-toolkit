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

const Tp = require('thingpedia');
const Stream = require('stream');
const fs = require('fs');

const { AVAILABLE_LANGUAGES } = require('../lib/languages');
const TokenizerService = require('../lib/tokenizer');
const { DatasetStringifier } = require('../lib/dataset-parsers');
const StreamUtils = require('../lib/stream-utils');
const Utils = require('../lib/utils');

const { DialogueParser } = require('./lib/dialog_parser');
const { maybeCreateReadStream, readAllLines } = require('./lib/argutils');

class DialogueToTurnStream extends Stream.Transform {
    constructor(options) {
        super({ objectMode: true });

        this._locale = options.locale;

        // FIXME should not load ThingTalk here
        this._options = options;
        this._debug = options.debug;
        this._side = options.side;
        this._flags = options.flags;
        this._target = require('../lib/languages/' + options.targetLanguage);

        this._tokenized = options.tokenized;
        this._tokenizer = null;
        if (!this._tokenized)
            this._tokenizer = TokenizerService.get('local', true);
    }

    async _preprocess(sentence, contextEntities) {
        if (this._tokenized) {
            const tokens = sentence.split(' ');
            const entities = Utils.makeDummyEntities(sentence);
            const tokenized = { tokens, entities };
            Utils.renumberEntities(tokenized, contextEntities);
            return tokenized;
        } else {
            const tokenized = await this._tokenizer.tokenize(this._locale, sentence);
            Utils.renumberEntities(tokenized, contextEntities);
            return tokenized;
        }
    }

    async _doTransform(dlg) {
        for (let i = 0; i < dlg.length; i++) {
            const turn = dlg[i];
            let context, contextCode, contextEntities;
            if (i > 0) {
                context = await this._target.parse(turn.context, this._options);
                [contextCode, contextEntities] = this._target.serializeNormalized(context);
            } else {
                context = null;
                contextCode = ['null'];
                contextEntities = {};
            }

            if (this._side === 'agent') {
                if (i === 0)
                    continue;
                const { tokens, entities } = await this._preprocess(turn.agent, contextEntities);
                const agentTarget = await this._target.parse(turn.agent_target, this._options);
                const code = await this._target.computeAgentPrediction(context, agentTarget, tokens, entities);

                this.push({
                    id: this._flags + '' + dlg.id + '/' + i,
                    context: contextCode.join(' '),
                    preprocessed: tokens.join(' '),
                    target_code: code.join(' ')
                });
            } else {
                const { tokens, entities } = await this._preprocess(turn.user, contextEntities);
                const userTarget = await this._target.parse(turn.user_target, this._options);
                const code = await this._target.computeUserPrediction(context, userTarget, tokens, entities);

                this.push({
                    id: this._flags + '' + dlg.id + '/' + i,
                    context: contextCode.join(' '),
                    preprocessed: tokens.join(' '),
                    target_code: code.join(' ')
                });
            }
        }

    }

    _transform(dialog, encoding, callback) {
        this._doTransform(dialog).then(() => callback(null), callback);
    }

    _flush(callback) {
        if (this._tokenizer)
            this._tokenizer.end();
        process.nextTick(callback);
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('dialog-to-contextual', {
            addHelp: true,
            description: "Transform a dialog input file into a contextual dataset (turn by turn)."
        });
        parser.addArgument(['-o', '--output'], {
            required: true,
            type: fs.createWriteStream
        });
        parser.addArgument('--tokenized', {
            required: false,
            action: 'storeTrue',
            defaultValue: true,
            help: "The dataset is already tokenized (this is the default)."
        });
        parser.addArgument('--no-tokenized', {
            required: false,
            dest: 'tokenized',
            action: 'storeFalse',
            help: "The dataset is not already tokenized."
        });
        parser.addArgument('--thingpedia', {
            required: true,
            help: 'Path to ThingTalk file containing class definitions.'
        });
        parser.addArgument(['-t', '--target-language'], {
            required: false,
            defaultValue: 'thingtalk',
            choices: AVAILABLE_LANGUAGES,
            help: `The programming language to generate`
        });
        parser.addArgument('--side', {
            required: true,
            choices: ['user', 'agent'],
            help: 'Which side of the conversation should be extracted.'
        });
        parser.addArgument('--flags', {
            required: false,
            defaultValue: '',
            help: 'Additional flags to add to the generated training examples.'
        });
        parser.addArgument('input_file', {
            nargs: '+',
            type: maybeCreateReadStream,
            help: 'Input dialog file; use - for standard input'
        });
        parser.addArgument(['-l', '--locale'], {
            required: false,
            defaultValue: 'en-US',
            help: `BGP 47 locale tag of the language to evaluate (defaults to 'en-US', English)`
        });
        parser.addArgument('--debug', {
            nargs: 0,
            action: 'storeTrue',
            help: 'Enable debugging.',
            defaultValue: true
        });
        parser.addArgument('--no-debug', {
            nargs: 0,
            action: 'storeFalse',
            dest: 'debug',
            help: 'Disable debugging.',
        });
    },

    async execute(args) {
        let tpClient = null;
        if (args.thingpedia)
            tpClient = new Tp.FileClient(args);

        readAllLines(args.input_file, '====')
            .pipe(new DialogueParser())
            .pipe(new DialogueToTurnStream({
                locale: args.locale,
                targetLanguage: args.target_language,
                thingpediaClient: tpClient,
                flags: args.flags,
                side: args.side,
                tokenized: args.tokenized,
                debug: args.debug
            }))
            .pipe(new DatasetStringifier())
            .pipe(args.output);

        await StreamUtils.waitFinish(args.output);
    }
};
