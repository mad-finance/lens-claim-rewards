import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import * as fs from "fs";
import csv from "csv-parser";
import { keccak256, toBuffer } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";
import { solidityPack } from "ethers/lib/utils";

interface CsvRow {
  profileId: string;
  claimScoreBbps: number;
}

/*
USAGE: put your csv in the root dir and run

npx ts-node ./ts-scripts/merkleClaimTree.ts --csvInputFile="merkle_claim_tree_input.csv" --jsonOutputFile="merkle_claim_tree_output.json"
*/
(async () => {
  const {
    csvInputFile,
    jsonOutputFile,
    includeLeaves = false, // optionally include the leaves in the output
    includeLayers = false, // optionally include the layers in the output
  } = yargs(hideBin(process.argv))
    .option("csvInputFile", { type: "string", demandOption: true })
    .option("jsonOutputFile", { type: "string", demandOption: true })
    .option("includeLeaves", { type: "boolean" })
    .option("includeLayers", { type: "boolean" })
    .parse();

  const csvData: CsvRow[] = [];

  fs.createReadStream(csvInputFile)
    .pipe(csv())
    .on("data", (data: CsvRow) => csvData.push(data))
    .on("end", () => {
      const leaves = csvData.map((row, index) => {
        return keccak256(
          toBuffer(
            solidityPack(
              ["uint256", "uint16"],
              [row.profileId, row.claimScoreBbps]
            )
          )
        );
      });

      const tree = new MerkleTree(leaves, keccak256, { sort: true });
      const root = tree.getHexRoot();

      const userData = {};
      csvData.forEach((row, index) => {
        const keys = Object.keys(row);
        const address = row[keys[0]]; // for some reason row.address doesn't work
        userData[address] = {
          proof: tree.getHexProof(leaves[index]),
          leaf: "0x" + leaves[index].toString("hex"),
          profileId: row.profileId,
          claimScoreBbps: row.claimScoreBbps,
        };
      });

      const treeJson = {
        root,
        userData,
        ...(includeLeaves
          ? { leaves: leaves.map((leaf) => "0x" + leaf.toString("hex")) }
          : {}),
        ...(includeLayers
          ? {
              layers: tree
                .getLayers()
                .map((layer) => layer.map((buf) => "0x" + buf.toString("hex"))),
            }
          : {}),
      };

      fs.writeFileSync(jsonOutputFile, JSON.stringify(treeJson, null, 2));
    });
})();
