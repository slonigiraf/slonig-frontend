// From https://github.com/ipfs-examples/js-ipfs-examples/blob/master/examples/browser-create-react-app/src/hooks/use-ipfs-factory.js

import { create } from 'ipfs-core'
import { useEffect, useState } from 'react'
import { multiaddr } from '@multiformats/multiaddr'

let ipfs = null

/*
 * A quick demo using React hooks to create an ipfs instance.
 *
 * Hooks are brand new at the time of writing, and this pattern
 * is intended to show it is possible. I don't know if it is wise.
 *
 * Next steps would be to store the ipfs instance on the context
 * so use-ipfs calls can grab it from there rather than expecting
 * it to be passed in.
 */
export default function useIpfsFactory () {
  const [isIpfsReady, setIpfsReady] = useState(Boolean(ipfs))
  const [ipfsInitError, setIpfsInitError] = useState(null)

  useEffect(() => {
    // The fn to useEffect should not return anything other than a cleanup fn,
    // So it cannot be marked async, which causes it to return a promise,
    // Hence we delegate to a async fn rather than making the param an async fn.

    startIpfs()
    return function cleanup () {
      if (ipfs && ipfs.stop) {
        console.log('Stopping IPFS')
        ipfs.stop().catch(err => console.error(err))
        ipfs = null
        setIpfsReady(false)
      }
    }
  }, [])

  async function startIpfs () {
    if (ipfs) {
      console.log('IPFS already started')
    } else if (window.ipfs && window.ipfs.enable) {
      console.log('Found window.ipfs')
      ipfs = await window.ipfs.enable({ commands: ['id'] })
    } else {
      try {
        console.time('IPFS Started')
        ipfs = await create()
        const validAddress = `/dns4/ipfs.slonig.org/tcp/4001/p2p/12D3KooWGQPM8YaKxsB5rziq4ESLm3ng5vvbri98nM5JLiWKj8uc`;
        const ma = multiaddr(validAddress);
        await ipfs.bootstrap.add(ma);

        console.timeEnd('IPFS Started')
      } catch (error) {
        console.error('IPFS init error:', error)
        ipfs = null
        setIpfsInitError(error)
      }
    }

    setIpfsReady(Boolean(ipfs))
  }

  return { ipfs, isIpfsReady, ipfsInitError }
}