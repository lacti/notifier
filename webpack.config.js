const path = require("path");
const slsw = require("serverless-webpack");

module.exports = {
  mode: "production",
  entry: slsw.lib.entries,
  devtool: "source-map",
  resolve: {
    extensions: [".js", ".json", ".ts", ".tsx"],
  },
  externals: [
    {
      "aws-sdk": "commonjs aws-sdk",
    },
  ],
  output: {
    libraryTarget: "commonjs",
    path: path.join(__dirname, ".webpack"),
    filename: "[name].js",
  },
  optimization: {
    // Webpack uglify can break mysqljs.
    // https://github.com/mysqljs/mysql/issues/1548
    minimize: false,
  },
  target: "node",
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
};
