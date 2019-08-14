import * as readline from 'readline'

class ReadLine {
  private reader: any

  constructor () {
    this.reader = null
  }

  getReader () {
    if (!this.reader) {
      this.reader = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
    }
    return this.reader
  }

  isOpen() {
    return this.reader !== null
  }

  discardReader() {
    this.reader = null
  }
}

export default ReadLine
