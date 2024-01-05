import { BigNumber, ethers, utils } from 'ethers'
import { GelatoRelay, CallWithERC2771Request, ERC2771Type, CallWithSyncFeeERC2771Request } from "@gelatonetwork/relay-sdk";
import { addresses } from '../addresses';
import { signPermit, signReceiveWithAuth } from "../sigUtils"
import forwarderAbi from "../abi/permit-forwarder.json";
import usdcAbi from "../abi/usdc.json";

// dot env
import dotenv from 'dotenv'
dotenv.config()

const RPC_URL = `https://arbitrum-sepolia.infura.io/v3/ea21b2313cdf43c28f25b849d7a75274`

const OWNER_PK = process.env.OWNER_PRIVATE_KEY!

const networkConfig = addresses.arbiSepolia

// This will be connected wallet in Metamask
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const user = new ethers.Wallet(OWNER_PK, provider);

const relay = new GelatoRelay();

// contract instances
const forwarder = new ethers.Contract(networkConfig.permitForwarder, forwarderAbi, user);

/**
 * npx ts-node examples/deposit/deposit-arbi-selfpaying.ts
 * not working now since Gelato Sepolia-Arbi doesn't support USDC
 */
async function run() {
  console.log('Depositing USDC with Gelato + Socket from', user.address)
  console.log('NetworkID:\t', (await (provider.getNetwork())).chainId)
  
  const usdc = new ethers.Contract(networkConfig.usdc, usdcAbi, user.provider)
  const balance = await usdc.balanceOf(user.address)
  console.log('Balance:\t', utils.formatUnits(balance, 6), 'USDC')

  const toSCW = true
  const depositAmount = 10_000000

  const maxFeeUSDC = 1_000000

  // Build Permit data
  const now = Math.floor(Date.now() / 1000)
  const deadline = now + 86400;
  const sig = await signPermit(
    user, 
    networkConfig.usdc, forwarder.address, depositAmount, deadline)
  
  // whole tx
  const minGas = '200000'
  const connector = networkConfig.fastConnector
  const { data } = await forwarder.populateTransaction.depositGasless(maxFeeUSDC, toSCW, minGas, connector, {
    value: depositAmount,
    deadline: deadline,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  })
  
  // Populate a relay request
  const request: CallWithSyncFeeERC2771Request = {
    chainId: provider.network.chainId,
    target: forwarder.address,
    data: ethers.utils.hexlify(data as string),
    user: user.address,
    feeToken: networkConfig.usdc,
  };

  // retrieve the estimate fee from Gelato Fee Oracle
  const fee = await relay.getEstimatedFee(
    (await provider.getNetwork()).chainId,
    networkConfig.usdc,
    BigNumber.from(minGas),
    false,
  )

  // fee quote
  console.log(`Estimated Fee:\t${utils.formatUnits(fee.toString(), 6)} USDC`)

  const relayResponse = await relay.callWithSyncFeeERC2771(request, user);  
  
  // Print status
  console.log('Gelato Task:\t', `https://relay.gelato.digital/tasks/status/${relayResponse.taskId}`);

  for(let i = 1; i < 10; i++) {
    const status = await relay.getTaskStatus(relayResponse.taskId);
    if (status?.taskState === "CheckPending" ||  status?.taskState === "ExecPending" || status?.taskState === "WaitingForConfirmation") {
      console.log('Task Status:\t', status?.taskState);
      await new Promise(r => setTimeout(r, 2000));
      continue  
    }
    
    // All non waiting states:
    console.log('Task Status:\t', status?.taskState);
    if (status?.transactionHash) {
      console.log('Transaction Hash:\t', status?.transactionHash);
    } 
    break
  }

  const balanceAfter = await usdc.balanceOf(user.address)
  console.log('New Balance:\t', utils.formatUnits(balanceAfter, 6), 'USDC')
}

run();