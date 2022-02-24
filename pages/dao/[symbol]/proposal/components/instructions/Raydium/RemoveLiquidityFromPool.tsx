/* eslint-disable @typescript-eslint/no-non-null-assertion */
import BigNumber from 'bignumber.js'
import React, { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
import { jsonInfo2PoolKeys } from '@raydium-io/raydium-sdk'
import {
  Governance,
  ProgramAccount,
  serializeInstructionToBase64,
} from '@solana/spl-governance'
import { PublicKey } from '@solana/web3.js'
import Input from '@components/inputs/Input'
import Select from '@components/inputs/Select'
import useGovernedMultiTypeAccounts from '@hooks/useGovernedMultiTypeAccounts'
import useRealm from '@hooks/useRealm'
import { createRemoveLiquidityInstruction } from '@tools/sdk/raydium/createRemoveLiquidityInstruction'
import { getLPMintInfo } from '@tools/sdk/raydium/helpers'
import { liquidityPoolKeysList } from '@tools/sdk/raydium/poolKeys'
import { debounce } from '@utils/debounce'
import { isFormValid } from '@utils/formValidation'
import { notify } from '@utils/notifications'
import {
  RemoveLiquidityRaydiumForm,
  UiInstruction,
} from '@utils/uiTypes/proposalCreationTypes'

import useWalletStore from 'stores/useWalletStore'

import { NewProposalContext } from '../../../new'
import GovernedAccountSelect from '../../GovernedAccountSelect'

const RemoveLiquidityFromPool = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const connection = useWalletStore((s) => s.connection)
  const wallet = useWalletStore((s) => s.current)
  const { realmInfo } = useRealm()
  const { governedMultiTypeAccounts } = useGovernedMultiTypeAccounts()

  const shouldBeGoverned = index !== 0 && governance
  const programId: PublicKey | undefined = realmInfo?.programId
  const [form, setForm] = useState<RemoveLiquidityRaydiumForm>({
    governedAccount: undefined,
    liquidityPool: '',
    amountIn: 0,
  })
  const [formErrors, setFormErrors] = useState({})
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [lpMintInfo, setLpMintInfo] = useState<{
    balance: number
    decimals: number
  } | null>(null)
  useEffect(() => {
    const fetchLpData = async () => {
      if (!form.governedAccount?.governance.pubkey || !form.liquidityPool)
        return
      const { lpMint } = liquidityPoolKeysList[form.liquidityPool]
      try {
        const { maxBalance, decimals } = await getLPMintInfo(
          connection,
          new PublicKey(lpMint),
          form.governedAccount.governance.pubkey
        )
        setLpMintInfo({ balance: maxBalance, decimals })
      } catch (e) {
        notify({
          type: 'error',
          message: 'Could not fetch LP Account',
          description: `${form.liquidityPool} LP Token Account could not be found for the selected Governance`,
        })
      }
    }
    fetchLpData()
  }, [form.governedAccount?.governance.pubkey, form.liquidityPool])

  const handleSetForm = ({ propertyName, value }) => {
    setFormErrors({})
    setForm({ ...form, [propertyName]: value })
  }
  const validateInstruction = async (): Promise<boolean> => {
    const { isValid, validationErrors } = await isFormValid(schema, form)
    setFormErrors(validationErrors)
    return isValid
  }
  async function getInstruction(): Promise<UiInstruction> {
    const isValid = await validateInstruction()
    let serializedInstruction = ''
    if (
      isValid &&
      programId &&
      form.governedAccount?.governance?.account &&
      form.liquidityPool &&
      lpMintInfo &&
      wallet?.publicKey
    ) {
      const createIx = createRemoveLiquidityInstruction(
        new PublicKey(form.governedAccount.governance.pubkey),
        jsonInfo2PoolKeys(liquidityPoolKeysList[form.liquidityPool]),
        new BigNumber(form.amountIn).shiftedBy(lpMintInfo.decimals).toString()
      )
      serializedInstruction = serializeInstructionToBase64(createIx)
    }
    const obj: UiInstruction = {
      serializedInstruction,
      isValid,
      governance: form.governedAccount?.governance,
    }
    return obj
  }
  useEffect(() => {
    handleSetForm({
      propertyName: 'programId',
      value: programId?.toString(),
    })
  }, [realmInfo?.programId])

  useEffect(() => {
    if (form.liquidityPool) {
      debounce.debounceFcn(async () => {
        const { validationErrors } = await isFormValid(schema, form)
        setFormErrors(validationErrors)
      })
      handleSetForm({
        value: form.liquidityPool,
        propertyName: 'liquidityPool',
      })
    }
  }, [form.liquidityPool])

  useEffect(() => {
    if (form.amountIn) {
      debounce.debounceFcn(async () => {
        const { validationErrors } = await isFormValid(schema, form)
        setFormErrors(validationErrors)
      })
    }
  }, [form.amountIn])

  useEffect(() => {
    handleSetInstructions(
      { governedAccount: form.governedAccount?.governance, getInstruction },
      index
    )
  }, [form])

  const schema = yup.object().shape({
    governedAccount: yup
      .object()
      .nullable()
      .required('Program governed account is required'),
    liquidityPool: yup.string().required('Liquidity Pool is required'),
    amountIn: yup
      .number()
      .moreThan(0, 'Amount for LP token should be more than 0')
      .required('Amount for LP token is required'),
  })

  return (
    <>
      <GovernedAccountSelect
        label="Governance"
        governedAccounts={governedMultiTypeAccounts}
        onChange={(value) => {
          handleSetForm({ value, propertyName: 'governedAccount' })
        }}
        value={form.governedAccount}
        error={formErrors['governedAccount']}
        shouldBeGoverned={shouldBeGoverned}
        governance={governance}
      ></GovernedAccountSelect>
      <Select
        label="Raydium Liquidity Pool"
        value={form.liquidityPool}
        placeholder="Please select..."
        onChange={(value) =>
          handleSetForm({ value, propertyName: 'liquidityPool' })
        }
        error={formErrors['liquidityPool']}
      >
        {Object.keys(liquidityPoolKeysList).map((pool, i) => (
          <Select.Option key={pool + i} value={pool}>
            {pool}
          </Select.Option>
        ))}
      </Select>

      <Input
        label={`LP Token Amount to withdraw - max: ${
          lpMintInfo ? lpMintInfo.balance : '-'
        }`}
        value={form.amountIn}
        type="number"
        min={0}
        max={10 ** 12}
        onChange={(evt) =>
          handleSetForm({
            value: evt.target.value,
            propertyName: 'amountIn',
          })
        }
        error={formErrors['amountIn']}
      />
    </>
  )
}

export default RemoveLiquidityFromPool
