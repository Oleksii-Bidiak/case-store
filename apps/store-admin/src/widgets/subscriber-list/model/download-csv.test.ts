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
});
