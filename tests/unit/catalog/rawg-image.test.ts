/**
 * The RAWG image mapping, rawgImage (src/lib/catalog/rawg.ts): a file under
 * RAWG's media path is served from RAWG's own resized copies, 420 px wide for
 * a search result and 640 px for the game's page; a file already resized or
 * cropped, or one on another host, is used as it is; no image, or anything
 * but an absolute https: URL, is none.
 *
 * Literal URLs only: nothing here reaches RAWG.
 */
import { describe, expect, it } from "vitest";
import { rawgImage } from "@/lib/catalog/rawg";

describe("rawgImage", () => {
  it("points a game's art at the 420 and 640 px copies", () => {
    expect(
      rawgImage(
        "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
      ),
    ).toEqual({
      thumbnailUrl:
        "https://media.rawg.io/media/resize/420/-/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
      pageUrl:
        "https://media.rawg.io/media/resize/640/-/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
    });
  });

  it("points a screenshot at the same copies", () => {
    expect(
      rawgImage(
        "https://media.rawg.io/media/screenshots/5f5/5f5a38a222252d996b18962806eed707.jpg",
      ),
    ).toEqual({
      thumbnailUrl:
        "https://media.rawg.io/media/resize/420/-/screenshots/5f5/5f5a38a222252d996b18962806eed707.jpg",
      pageUrl:
        "https://media.rawg.io/media/resize/640/-/screenshots/5f5/5f5a38a222252d996b18962806eed707.jpg",
    });
  });

  it.each([
    [
      "resized",
      "https://media.rawg.io/media/resize/1280/-/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
    ],
    [
      "cropped",
      "https://media.rawg.io/media/crop/600/400/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
    ],
  ])("leaves a file already %s as it is", (_, url) => {
    expect(rawgImage(url)).toEqual({ thumbnailUrl: url, pageUrl: url });
  });

  it.each([
    ["another host", "https://images.example.com/media/games/b29/cover.jpg"],
    [
      "RAWG's host outside its media path",
      "https://media.rawg.io/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
    ],
  ])("uses a file on %s as the original for both", (_, url) => {
    expect(rawgImage(url)).toEqual({ thumbnailUrl: url, pageUrl: url });
  });

  it("gives no image for null", () => {
    expect(rawgImage(null)).toBeNull();
  });

  it("gives no image for an empty string, as for null", () => {
    expect(rawgImage("")).toBeNull();
  });

  it.each([
    ["a path without a host", "/media/games/b29/cover.jpg"],
    ["a scheme-relative URL", "//images.example.com/media/games/b29/cover.jpg"],
    [
      "RAWG's host over plain http",
      "http://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
    ],
  ])("gives no image for %s", (_, url) => {
    expect(rawgImage(url)).toBeNull();
  });
});
