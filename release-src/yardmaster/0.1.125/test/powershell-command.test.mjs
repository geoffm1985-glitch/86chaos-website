import test from 'node:test';
import {commandExecutionRegression,commandFeedbackRegression} from './helpers/powershell-command-regression.mjs';
test('Play Store: malformed commands execute nothing; complete files preserve multiline literals and reject input prompts',{skip:process.platform!=='win32'},commandExecutionRegression);
test('Play Store: rejected PowerShell command is sent back for correction, preserving the failure report',()=>commandFeedbackRegression());
test('Play Store: three failed command attempts pause for action instead of an unbounded loop',()=>commandFeedbackRegression(true));
