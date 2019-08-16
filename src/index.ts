import { randomBytes } from 'crypto'
import * as swarm from 'discovery-swarm'
import * as defaults from 'dat-swarm-defaults'
import * as getPort from 'get-port'
import * as readline from 'readline'
import { writeFile, readFile } from 'fs'
import * as path from 'path'
import { uniqueNamesGenerator } from 'unique-names-generator'

/**
 * Here we will save our TCP peer connections
 * using the peer id as key: { peer_id: TCP_Connection }
 */
const peers: Record<any, any> = {}
// Counter for connections, used for identify connections
let nextConnId = 0

// Peer Identity, a random hash for identify your peer
const myId = randomBytes(32)

console.log(`Your identity:\n  ${myId.toString('hex')}`)

const rline = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rline.on('line', (fileName: string) => {
  console.log(`\nSending file ${fileName}`)
  readFile(path.resolve(__dirname, '../files', fileName), (err: NodeJS.ErrnoException | null, data: Buffer) => {
    if (err) {
      // console.log(`- ${err}`)
      console.log(`- Error on reading file`)
    } else {
      // Broadcast to peers
      let peersIds = ''
      for (let id in peers) {
        peers[id].conn.write(Buffer.from(JSON.stringify({
          fileName: fileName,
          data: data
        })))
        peersIds = peersIds.concat(`${id}, `)
      }
      console.log(`- File sent to: ${peersIds}`)
    }
  })
})

/** 
 * Default DNS and DHT servers
 * This servers are used for peer discovery and establishing connection
 */
const config = defaults({
  // peer-id
  id: myId
})

/**
 * discovery-swarm library establishes a TCP p2p connection and uses
 * discovery-channel library for peer discovery
 */
const sw = swarm(config)


const app = async () => {
  // Choose a random unused port for listening TCP peer connections
  const port = await getPort()

  sw.listen(port)
  console.log(`Listening to port: ${port}`)

  /**
   * The channel we are connecting to.
   * Peers should discover other peers in this channel
   */
  sw.join('file-sharing-channel')

  sw.on('connection', (conn: any, info: any) => {

    // Connection id
    const connId = nextConnId
    const peerId = info.id.toString('hex')

    console.log(`\nConnection ${connId} to peer:\n  ${peerId}`)

    // Keep alive TCP connection with peer
    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600)
      } catch (err) {
        console.log(err)
      }
    }

    conn.on('data', (data: Buffer) => {
      console.log(`\nReceiving data from peer\n  ${peerId}`)
      // Here we handle incomming messages
      let dataJSON 
      try {
        let dataStr = data.toString()
        dataJSON = JSON.parse(dataStr)
      } catch(err) {
        // console.log(`- ${err}`)
        console.log(`- Error on parsing file`)
        return
      }
      console.log(`- Received file ${dataJSON.fileName}`)

      const savePath = path.resolve(__dirname, '../downloads', dataJSON.fileName)
      writeFile(savePath, Buffer.from(dataJSON.data), (err: NodeJS.ErrnoException | null) => {
        if (err) {
          // console.log(`- ${err}`)
          console.log(`- Error on saving file`)
        } else {
          console.log(`- Succeeded on saving file to ${savePath}`)
        }
      })
    })

    conn.on('close', () => {
      console.log(`\nConnection ${connId} closed, peer: \n  ${peerId}`)
      // If the closing connection is the last connection with the peer, removes the peer
      if (peers[peerId].connId === connId) {
        delete peers[peerId]
      }
    })

    // Save the connection
    if (!peers[peerId]) {
      peers[peerId] = {}
    }
    peers[peerId].conn = conn
    peers[peerId].connId = connId
    nextConnId++
  })
}
app()
