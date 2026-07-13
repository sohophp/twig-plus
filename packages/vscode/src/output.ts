import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

export function initializeTwigPlusOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
  channel ??= vscode.window.createOutputChannel("TwigPlus");
  context.subscriptions.push(channel);
  return channel;
}

export function getTwigPlusOutput(): vscode.OutputChannel {
  return channel ??= vscode.window.createOutputChannel("TwigPlus");
}
