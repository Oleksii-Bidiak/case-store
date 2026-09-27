import { downloadCsv } from "./download-csv";

describe("downloadCsv", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => "blob:mock-url");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    jest.restoreAllMocks();
  });

  it("creates a downloadable anchor with the given filename and clicks it", () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv("email,status\na@b.com,SUBSCRIBED", "subs.csv");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = (URL.createObjectURL as jest.Mock).mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain("text/csv");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The synthetic anchor is cleaned up after the click.
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  // TASK-691: the browser drops the server's BOM while decoding the response,
  // so the saved file must get it here — exactly once. Bytes, not text: a text
  // decode would strip the very BOM under test.
  async function savedBytes(csv: string): Promise<number[]> {
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    downloadCsv(csv, "subs.csv");
    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }

  it("starts the saved file with the UTF-8 BOM", async () => {
    const bytes = await savedBytes("email,source\na@b.com,головна");
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.slice(3, 8)).toEqual(Array.from(Buffer.from("email")));
  });

  it("does not double a BOM that survived the transport", async () => {
    const bytes = await savedBytes("﻿email,source");
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.slice(3, 6)).not.toEqual([0xef, 0xbb, 0xbf]);
  });
});
