import * as assert from "assert";
import { promises as fsp } from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as vscode from "vscode";
import * as sinon from "sinon";
import TestCase, {
  SerializedPosition,
  SerializedRange,
  SerializedSelection,
  TestCaseFixture,
} from "../../TestCase";
import { SymbolColor } from "../../constants";

function deserializePosition(position: SerializedPosition) {
  return new vscode.Position(position.line, position.character);
}

function deserializeSelection(
  selection: SerializedSelection
): vscode.Selection {
  const active = deserializePosition(selection.active);
  const anchor = deserializePosition(selection.anchor);
  return new vscode.Selection(anchor, active);
}

suite("recorded test cases", async function () {
  this.timeout(100000);
  const directory = path.join(__dirname, "../../../testFixtures");
  const files = await fsp.readdir(directory);

  files.forEach(async (file) => {
    test(file.split(".")[0], async function () {
      const cursorless = vscode.extensions.getExtension("pokey.cursorless");

      if (cursorless == null) {
        throw new Error("Could not get cursorless extension");
      }

      const cursorlessApi = await cursorless.activate();
      const buffer = await fsp.readFile(path.join(directory, file));
      const fixture = yaml.load(buffer.toString()) as TestCaseFixture;

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      const document = await vscode.workspace.openTextDocument({
        language: fixture.languageId,
        content: fixture.initialState.document,
      });
      const editor = await vscode.window.showTextDocument(document);
      editor.selections =
        fixture.initialState.selections.map(deserializeSelection);

      if (fixture.initialState.thatMark) {
        const thatMarkFixture = fixture.initialState.thatMark.map((mark) => ({
          selection: deserializeSelection(mark),
          editor,
        }));
        // sinon.replace(cursorlessApi, "thatMark", thatMarkFixture);
        // TODO Either way fails!
        // cursorlessApi.thatMark = thatMarkFixture;
      }

      await vscode.env.clipboard.writeText("");
      // TODO Literally any way I try to mock this fails
      // let clipText = fixture.initialState.clipboard;
      // sinon.replaceGetter(vscode.env, "clipboard", () => ({
      //   readText: async () => clipText,
      //   writeText: async (value) => {
      //     clipText = value;
      //   },
      // }));

      // Assert that recorded decorations are present
      Object.entries(fixture.marks).forEach(([key, _]) => {
        const [color, character] = key.split(".") as [SymbolColor, string];
        const token = cursorlessApi.navigationMap.getToken(color, character);
        assert(token != null);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await vscode.commands.executeCommand(
        "cursorless.command",
        fixture.command.actionName,
        fixture.command.partialTargets,
        ...fixture.command.extraArgs
      );

      sinon.restore();
      assert.deepStrictEqual(
        fixture.finalState,
        await TestCase.getSnapshot(cursorlessApi.thatMark)
      );
    });
  });
});
