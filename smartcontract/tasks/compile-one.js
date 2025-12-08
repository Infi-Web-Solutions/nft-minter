task("compile-one", "Compile only one Solidity file")
  .addParam("file")
  .setAction(async (args, hre) => {
    hre.config.paths.sources = ".";
    hre.config.compilerOptions = {
      includePaths: [args.file],
    };
    await hre.run("compile");
  });
