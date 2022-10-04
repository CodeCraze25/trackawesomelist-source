import { DocItem, FileInfo, ParseOptions } from "../../interface.ts";
import {
  Content,
  fromMarkdown,
  TableRow,
  toMarkdown,
  visit,
} from "../../deps.ts";
import { childrenToRoot, promiseLimit, writeTextFile } from "../../util.ts";
import _log from "../../log.ts";
import formatMarkdownItem from "../../format-markdown-item.ts";
import { gfm, gfmFromMarkdown, gfmToMarkdown } from "../../deps.ts";

export default async function (
  content: string,
  fileInfo: FileInfo,
): Promise<DocItem[]> {
  const fileConfig = fileInfo.fileConfig;
  const options = fileConfig.options;
  const items: DocItem[] = [];
  const tree = fromMarkdown(content, "utf8", {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  let index = 0;
  let currentLevel = 0;
  let currentSubCategory = "";
  let currentCategory = "";
  let lowestHeadingLevel = 3;
  // first check valided sections
  const validSections: Content[] = [];
  for (const rootNode of tree.children) {
    if (rootNode.type === "heading") {
      currentLevel = rootNode.depth;
      if (currentLevel > lowestHeadingLevel) {
        lowestHeadingLevel = currentLevel;
      }
      validSections.push(rootNode);
    } else if (rootNode.type === "table") {
      validSections.push(rootNode);
    }
  }
  const min_heading_level = options.min_heading_level || lowestHeadingLevel;
  const max_heading_level = options.max_heading_level || 2;
  const funcs: (() => Promise<DocItem>)[] = [];
  // console.log("validSections", validSections);
  for (const rootNode of validSections) {
    // console.log("rootNode", rootNode);
    if (rootNode.type === "heading") {
      currentLevel = rootNode.depth;
      if (
        currentLevel < min_heading_level && currentLevel >= max_heading_level
      ) {
        currentCategory = toMarkdown(childrenToRoot(rootNode.children));
      } else if (currentLevel === min_heading_level) {
        currentSubCategory = toMarkdown(childrenToRoot(rootNode.children));
      }
    } else if (rootNode.type === "table") {
      // console.log("rootNode", rootNode);
      // await writeTextFile("temp.json", JSON.stringify(rootNode));
      await console.log("s");
      let rowIndex = 0;
      for (const item of rootNode.children) {
        // console.log("item", item);
        if (item.type === "tableRow") {
          if (rowIndex === 0) {
            // first row is header
            rowIndex++;
            continue;
          }
          let category = "";
          if (currentCategory) {
            category = currentCategory.trim().replace(/\n/g, " ");
          }
          if (currentSubCategory) {
            if (category) {
              category += " / ";
            }
            category += currentSubCategory.trim().replace(/\n/g, " ");
          }
          funcs.push(() => {
            return formatMarkdownItem(item as TableRow, fileInfo).then(
              (formatedItem) => {
                let markdown = "- ";
                // transform table row to item
                (formatedItem as TableRow).children.forEach(
                  (child, cellIndex) => {
                    const tableHeaderCell =
                      rootNode.children[0].children[cellIndex];
                    let tableHeaderCellMarkdown = "";
                    try {
                      tableHeaderCellMarkdown = toMarkdown(
                        tableHeaderCell,
                        {
                          extensions: [gfmToMarkdown()],
                        },
                      ).trim();
                    } catch (e) {
                      console.log("e", e);
                      console.log("tableHeaderCell", tableHeaderCell);
                    }
                    const rowCellMarkdown = toMarkdown(
                      child,
                      {
                        extensions: [gfmToMarkdown()],
                      },
                    ).trim();
                    if (cellIndex > 0) {
                      markdown +=
                        `  ${tableHeaderCellMarkdown}: ${rowCellMarkdown}\n\n`;
                    } else {
                      markdown +=
                        `${tableHeaderCellMarkdown}: ${rowCellMarkdown}\n\n`;
                    }
                  },
                );

                return {
                  formatedMarkdown: markdown,
                  rawMarkdown: toMarkdown(item, {
                    extensions: [gfmToMarkdown()],
                  })
                    .trim(),
                  category: category,
                  line: item.position!.end.line,
                };
              },
            );
          });
          rowIndex++;
        }
      }
    }
  }

  return promiseLimit<DocItem>(funcs);
}
