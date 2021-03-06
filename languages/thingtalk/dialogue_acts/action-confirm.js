// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const assert = require('assert');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;

const C = require('../ast_manip');

const {
    makeAgentReply,
    makeSimpleState,
    sortByName,
    setOrAddInvocationParam,
    replaceAction,
} = require('../state_manip');


function makeActionConfirmationPhrase(ctx, action) {
    const ctxInvocation = C.getInvocation(ctx.next);
    if (ctxInvocation.selector.isBuiltin)
        return null;
    if (!C.isSameFunction(ctxInvocation.schema, action.schema))
        return null;

    // all parameters have been slot-filled, otherwise we wouldn't be confirming...
    assert(ctxInvocation.in_params.every((ip) => !ip.value.isUndefined));
    if (action.in_params.length !== ctxInvocation.in_params.length)
        return null;

    ctxInvocation.in_params.sort(sortByName);
    action.in_params.sort(sortByName);

    for (let i = 0; i < action.in_params.length; i++) {
        if (action.in_params[i].name !== ctxInvocation.in_params[i].name)
            return null;

        if (!action.in_params[i].value.equals(ctxInvocation.in_params[i].value))
            return null;
    }

    return makeAgentReply(ctx, makeSimpleState(ctx, 'sys_confirm_action', null), null, Type.Boolean);
}

function actionConfirmAcceptPhrase(ctx) {
    const clone = ctx.clone();
    assert(clone.next.confirm === 'accepted');
    clone.next.confirm = 'confirmed';
    clone.state.dialogueAct = 'execute';
    clone.state.dialogueActParam = null;
    return clone.state;
}

function actionConfirmRejectPhrase(ctx) {
    const clone = ctx.clone();
    clone.next.confirm = 'proposed';
    return makeSimpleState(clone, 'cancel', null);
}

function actionConfirmChangeParam(ctx, answer) {

    const action = C.getInvocation(ctx.next);
    if (!action) return null;

    // don't accept in params that don't apply to this specific action
    const arg = ctx.nextFunctionSchema.getArgument(answer.name);
    if (!arg || !arg.is_input || !arg.type.equals(answer.value.getType()))
        return null;

    const clone = action.clone();
    setOrAddInvocationParam(clone, answer.name, answer.value);
    return replaceAction(ctx, 'execute', clone, 'confirmed');
}

module.exports = {
    makeActionConfirmationPhrase,
    actionConfirmAcceptPhrase,
    actionConfirmRejectPhrase,
    actionConfirmChangeParam
};
