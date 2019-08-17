import { randomBytes } from 'crypto'
import * as swarm from 'discovery-swarm'
import * as defaults from 'dat-swarm-defaults'
import * as getPort from 'get-port'
import * as readline from 'readline'
import { writeFile, readFile, existsSync, mkdirSync } from 'fs'
import * as path from 'path'

class App {
  private peers: Record<any, any>
  private nextConnId: number
  private myId: Buffer
  private sw: any

  constructor() {
    this.peers = {}
    this.nextConnId = 0
    this.myId = randomBytes(32)

    console.log(`Your identity:\n  ${this.myId.toString('hex')}`)

    /** 
     * Default DNS and DHT servers
     * This servers are used for peer discovery and establishing connection
     */
    const config = defaults({
      id: this.myId
    })

    /**
     * discovery-swarm library establishes a TCP p2p connection and uses
     * discovery-channel library for peer discovery
     */
    this.sw = swarm(config)
  }

  /**
   * configures what should be done for each line of input
   */
  private setupOnLineEvent (): void {
    const rline = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rline.on('line', (fileName: string) => {
      console.log(`\nSending file ${fileName}`)

      readFile(path.resolve(__dirname, '../../files', fileName), (err: NodeJS.ErrnoException | null, data: Buffer) => {
        if (err) console.log(`- Error on reading file`, err)
        else {
          let peersIds = ''
          for (let id in this.peers) {
            this.peers[id].conn.write(Buffer.from(JSON.stringify({
              fileName: fileName,
              data: data
            })))
            peersIds = peersIds.concat(`${id}, `)
          }

          console.log(`- File sent to: ${peersIds}`)
        }
      })
    })
  }


  /**
   * Run swarm and search for peers
   */
  async run (): Promise<any> {
    // Configure what should be done for each line of input
    this.setupOnLineEvent()

    // Choose a random unused port for listening TCP peer connections
    const port = await getPort()
    this.sw.listen(port)
    console.log(`Listening to port: ${port}`)

    /**
     * The channel we are connecting to.
     * Peers should discover other peers in this channel
     */
    this.sw.join('file-sharing-channel')

    this.sw.on('connection', (conn: any, info: any) => {
      // Connection id
      const connId = this.nextConnId
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
        console.log(`\nReceiving file from peer\n  ${peerId}`)
        // Here we handle incomming messages
        let file 
        try {
          let dataStr = data.toString()
          file = JSON.parse(dataStr)
        } catch(err) {
          console.log(`- Error on parsing file`, err)
          return
        }
        console.log(`- Received file ${file.fileName}`)

        let downloadFolder = path.resolve(__dirname, '../../downloads')
        const savePath = path.resolve(downloadFolder, file.fileName)
        if (!existsSync(downloadFolder)) mkdirSync(downloadFolder)

        writeFile(savePath, Buffer.from(file.data), (err: NodeJS.ErrnoException | null) => {
          if (err) {
            // console.log(`- ${err}`)
            console.log(`- Error on saving file`, err)
          } else {
            console.log(`- Succeeded on saving file to ${savePath}`)
          }
        })
      })

      conn.on('close', () => {
        console.log(`\nConnection ${connId} closed, peer: \n  ${peerId}`)
        // If the closing connection is the last connection with the peer, removes the peer
        if (this.peers[peerId].connId === connId) {
          delete this.peers[peerId]
        }
      })

      // Save the connection
      if (!this.peers[peerId]) {
        this.peers[peerId] = {}
      }
      this.peers[peerId].conn = conn
      this.peers[peerId].connId = connId
      this.nextConnId++
    })
  }
}

export default App
