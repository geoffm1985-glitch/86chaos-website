import {test} from '@playwright/test';
import {commandExecutionRegression,commandFeedbackRegression} from '../helpers/powershell-command-regression.mjs';
test('PowerShell failure regression: parser prevents partial execution and noninteractive runner rejects input',async()=>{test.skip(process.platform!=='win32');await commandExecutionRegression()});
test('PowerShell failure regression: real handoff requests a corrected command and preserves its report',()=>commandFeedbackRegression());
test('PowerShell failure regression: three failures produce a resumable action alert',()=>commandFeedbackRegression(true));
