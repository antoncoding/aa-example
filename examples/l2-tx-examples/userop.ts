import { ethers, BigNumber } from "ethers";

import { Client, Presets } from "userop";
import { BundlerJsonRpcProvider, IUserOperationMiddlewareCtx } from "userop";

import dotenv from 'dotenv'
dotenv.config()

import usdcAbi from "../abi/usdc.json";


const privateKey = process.env.OWNER_PRIVATE_KEY!
const bundlerUrl = process.env.LOCAL_BUNDLER_URL!

const entryPoint = process.env.LOCAL_ENTRY_POINT!
const simpleAccountFactory = process.env.LOCAL_SIMPLEACCOUNT_FACTORY

const rpcUrl = process.env.L2_RPC!; // Lyra staging
const provider = new BundlerJsonRpcProvider(rpcUrl).setBundlerRpc(bundlerUrl);

const user = new ethers.Wallet(privateKey, provider);

const dumbPaymaster = "0xd198a6f2B3D07a03161FAB8006502e911e5c548e";
const stagingUSDC = "0xAeE02dB1c65ce17211252f7eba0CDCcA07E95548"

// contract instances
const usdcContract = new ethers.Contract(stagingUSDC, usdcAbi, user);

// apply our own dumb paymaster: pay for anyone
const paymasterMiddleware: (context: IUserOperationMiddlewareCtx) => Promise<void> = async (context) => {
  context.op.paymasterAndData = dumbPaymaster;
  // previously only 21000, need to add more (adding 30000)
  context.op.preVerificationGas = BigNumber.from(context.op.preVerificationGas).add(BigNumber.from(30000));

  // need to update callGasLimit as well
  context.op.callGasLimit = BigNumber.from(context.op.callGasLimit).add(BigNumber.from(60000));
}

async function transferWithUserOp(transferAmount: string) {
  // simpleAccount preset
  const simpleAccount = await Presets.Builder.SimpleAccount.init(
    user, // Any object compatible with ethers.Signer
    rpcUrl,
    {
      entryPoint: entryPoint,
      factory: simpleAccountFactory,
      overrideBundlerRpc: bundlerUrl,
      paymasterMiddleware: paymasterMiddleware
    }
  );

  const sender = simpleAccount.getSender();
  console.log('sender (smart contract wallet)', sender)

  const client = await Client.init(rpcUrl, {overrideBundlerRpc: bundlerUrl, entryPoint: entryPoint});

  // build transaction: random send usdc tx
  const target = stagingUSDC; // usdc address
  const data =  usdcContract.interface.encodeFunctionData("transfer(address,uint256)", [
    user.address, // owner / can be random
    transferAmount,
  ])

  const res = await client.sendUserOperation(
    simpleAccount.execute(target, 0, data),
    { 
      onBuild: (op) => console.log("Signed UserOperation:", op.sender),
    }
  );
  // console.log(op.sender)
  // const res = await client.sendUserOperation(op);
  console.log(`UserOpHash: ${res.userOpHash}`);

  // console.log("Waiting for transaction...");
  const result = await res.wait();  
  result?.transactionHash && console.log(`Transaction hash: ${result.transactionHash}`);
}

transferWithUserOp('1000000').then(() => process.exit(0))