import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const python = await findPython();
  if (!python) {
    vscode.window
      .showErrorMessage(
        "ClearNotation requires Python 3.11+. Set python.defaultInterpreterPath in VS Code settings.",
        "Open Settings"
      )
      .then((choice) => {
        if (choice === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "python.defaultInterpreterPath"
          );
        }
      });
    return;
  }

  const hasPackage = await checkInstallation(python);
  if (!hasPackage) {
    const action = await vscode.window.showWarningMessage(
      "ClearNotation language server is not installed.",
      "Install (pip install clearnotation[lsp])"
    );
    if (action) {
      const terminal = vscode.window.createTerminal("ClearNotation Install");
      terminal.show();
      terminal.sendText(`${python} -m pip install "clearnotation[lsp]"`);
    }
    return;
  }

  const serverOptions: ServerOptions = {
    command: python,
    args: ["-c", "from clearnotation_reference.lsp import main; main()"],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "clearnotation" }],
  };

  client = new LanguageClient(
    "clearnotation",
    "ClearNotation Language Server",
    serverOptions,
    clientOptions
  );

  await client.start();
}

export async function deactivate() {
  if (client) {
    await client.stop();
  }
}

async function findPython(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration("python");
  const configured = config.get<string>("defaultInterpreterPath");
  if (configured && configured !== "python") {
    if (await isPythonValid(configured)) return configured;
  }

  const venvPython = process.env.VIRTUAL_ENV
    ? path.join(process.env.VIRTUAL_ENV, "bin", "python3")
    : undefined;
  if (venvPython && (await isPythonValid(venvPython))) return venvPython;

  for (const candidate of ["python3", "python"]) {
    if (await isPythonValid(candidate)) return candidate;
  }
  return undefined;
}

function isPythonValid(pythonPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      pythonPath,
      ["-c", "import sys; assert sys.version_info >= (3, 11)"],
      (error) => resolve(!error)
    );
  });
}

function checkInstallation(pythonPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      pythonPath,
      ["-c", "import clearnotation_reference.lsp"],
      (error) => resolve(!error)
    );
  });
}
