import { DocItem, FileInfo, ParseparseOptions } from "../../interface.ts";
import { Content, fromMarkdown, Link, toMarkdown, visit } from "../../deps.ts";
import { childrenToRoot, getRepoHTMLURL, promiseLimit } from "../../util.ts";
import log from "../../log.ts";
import formatMarkdownItem from "../../format-markdown-item.ts";
export default function (
  content: string,
  fileInfo: FileInfo,
): Promise<DocItem[]> {
  const fileConfig = fileInfo.fileConfig;
  const parseOptions = fileConfig.options;
  const items: DocItem[] = [];
  const tree = fromMarkdown(content, "utf8", {});
  let index = 0;
  let currentLevel = 0;
  let currentSubCategory = "";
  let currentCategory = "";
  let lowestHeadingLevel = 3;
  // first check valided sections
  const validSections: Content[] = [];
  let isReachedValidSection = false;
  for (const rootNode of tree.children) {
    // start with the first valid ma  x_heading_level

    if (!isReachedValidSection) {
      // check is valid now
      if (
        rootNode.type === "heading" &&
        rootNode.depth === parseOptions.max_heading_level
      ) {
        isReachedValidSection = true;
      } else {
        continue;
      }
    }

    if (rootNode.type === "heading") {
      currentLevel = rootNode.depth;

      if (
        currentLevel > lowestHeadingLevel
      ) {
        lowestHeadingLevel = currentLevel;
      }
      validSections.push(rootNode);
    } else if (rootNode.type === "list") {
      // check if all links is author link
      // if so, it's a table of content
      // ignore it
      let internalLinkCount = 0;
      let externalLinkCount = 0;
      visit(childrenToRoot(rootNode.children), "link", (node) => {
        if (!node.url.startsWith("#")) {
          internalLinkCount++;
        } else {
          externalLinkCount++;
        }
      });
      // for fix some repo's toc include a little external links
      // we still treat it as toc if internal link count is more than 80%
      // for example: https://github.com/EbookFoundation/free-programming-books/blob/main/books/free-programming-books-langs.md#bootstrap
      if (
        externalLinkCount === 0 ||
        (internalLinkCount > 10 && externalLinkCount < 2)
      ) {
        validSections.push(rootNode);
      }
    }
  }
  const min_heading_level = parseOptions.min_heading_level ||
    lowestHeadingLevel;
  const max_heading_level = parseOptions.max_heading_level || 2;

  const funcs: (() => Promise<DocItem>)[] = [];
  for (const rootNode of validSections) {
    if (rootNode.type === "heading") {
      currentLevel = rootNode.depth;
      if (
        currentLevel < min_heading_level && currentLevel >= max_heading_level
      ) {
        currentCategory = toMarkdown(childrenToRoot(rootNode.children));
      } else if (currentLevel === min_heading_level) {
        currentSubCategory = toMarkdown(childrenToRoot(rootNode.children));
      }
    } else if (rootNode.type === "list") {
      for (const item of rootNode.children) {
        if (item.type === "listItem") {
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
            return formatMarkdownItem(item, fileInfo).then((formatedItem) => {
              return {
                formatedMarkdown: toMarkdown(formatedItem).trim(),
                rawMarkdown: toMarkdown(item).trim(),
                category: category,
                line: item.position!.end.line,
              };
            });
          });
        }
      }
    }
  }

  return promiseLimit<DocItem>(funcs);
}
