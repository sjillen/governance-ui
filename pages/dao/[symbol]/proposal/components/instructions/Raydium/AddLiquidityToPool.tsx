/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, { useContext, useEffect, useState } from 'react'
import BigNumber from 'bignumber.js'
import * as yup from 'yup'
import { BN } from '@project-serum/anchor'
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
import { createAddLiquidityInstruction } from '@tools/sdk/raydium/createAddLiquidityInstruction'
import {
  getAmountOut,
  getLiquidityPoolKeysByLabel,
} from '@tools/sdk/raydium/helpers'
import { liquidityPoolKeysList } from '@tools/sdk/raydium/poolKeys'
import { debounce } from '@utils/debounce'
import { isFormValid } from '@utils/formValidation'
import {
  AddLiquidityRaydiumForm,
  UiInstruction,
} from '@utils/uiTypes/proposalCreationTypes'
import useWalletStore from 'stores/useWalletStore'

import { NewProposalContext } from '../../../new'
import GovernedAccountSelect from '../../GovernedAccountSelect'

const AddLiquidityToPool = ({
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
  const [form, setForm] = useState<AddLiquidityRaydiumForm>({
    governedAccount: undefined,
    liquidityPool: '',
    baseAmountIn: 0,
    quoteAmountIn: 0,
    fixedSide: 'base',
    slippage: 0.5,
  })
  const [formErrors, setFormErrors] = useState({})
  const { handleSetInstructions } = useContext(NewProposalContext)
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
      wallet?.publicKey
    ) {
      const poolKeys = getLiquidityPoolKeysByLabel(form.liquidityPool)
      const [base, quote] = await Promise.all([
        connection.current.getTokenSupply(poolKeys.baseMint),
        connection.current.getTokenSupply(poolKeys.quoteMint),
      ])

      const createIx = createAddLiquidityInstruction(
        poolKeys,
        new BN(
          new BigNumber(form.baseAmountIn.toString())
            .shiftedBy(base.value.decimals)
            .toString()
        ),
        new BN(
          new BigNumber(form.quoteAmountIn.toString())
            .shiftedBy(quote.value.decimals)
            .toString()
        ),
        form.fixedSide,
        form.governedAccount.governance.pubkey
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
    if (form.baseAmountIn) {
      debounce.debounceFcn(async () => {
        handleSetForm({
          value: await getAmountOut(
            form.liquidityPool,
            form.baseAmountIn,
            connection,
            form.slippage
          ),
          propertyName: 'quoteAmountIn',
        })
        const { validationErrors } = await isFormValid(schema, form)
        setFormErrors(validationErrors)
      })
    }
  }, [form.baseAmountIn, form.slippage])

  useEffect(() => {
    isFormValid(schema, form).then(({ validationErrors }) => {
      setFormErrors(validationErrors)
    })
  }, [form.quoteAmountIn])

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
    baseAmountIn: yup
      .number()
      .moreThan(0, 'Amount for Base token should be more than 0')
      .required('Amount for Base token is required'),
    quoteAmountIn: yup
      .number()
      .moreThan(0, 'Amount for Quote token should be more than 0')
      .required('Amount for Quote token is required'),
    fixedSide: yup
      .string()
      .equals(['base', 'quote'])
      .required('Fixed Side is required'),
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
      {form.liquidityPool ? (
        <>
          <Input
            label="Base Token Amount to deposit"
            value={form.baseAmountIn}
            type="number"
            min={0}
            max={10 ** 12}
            onChange={(evt) =>
              handleSetForm({
                value: evt.target.value,
                propertyName: 'baseAmountIn',
              })
            }
            error={formErrors['baseAmountIn']}
          />

          <Select
            label="Slippage (%)"
            value={form.slippage}
            onChange={(value) =>
              handleSetForm({ value, propertyName: 'slippage' })
            }
            error={formErrors['slippage']}
          >
            {[0.5, 1, 2].map((value, i) => (
              <Select.Option key={value.toString() + i} value={value}>
                {value}
              </Select.Option>
            ))}
          </Select>

          <Input
            label="Quote Token Amount to deposit"
            value={form.quoteAmountIn}
            type="number"
            min={0}
            max={10 ** 12}
            onChange={(evt) =>
              handleSetForm({
                value: Number(evt.target.value),
                propertyName: 'quoteAmountIn',
              })
            }
            disabled={true}
            error={formErrors['quoteAmountIn']}
          />
          <Select
            label="Fixed Side"
            value={form.fixedSide}
            placeholder="Please select..."
            onChange={(value) =>
              handleSetForm({ value, propertyName: 'fixedSide' })
            }
            error={formErrors['fixedSide']}
          >
            {['base', 'quote'].map((value, i) => (
              <Select.Option key={value + i} value={value}>
                {value}
              </Select.Option>
            ))}
          </Select>
        </>
      ) : null}
    </>
  )
}

export default AddLiquidityToPool
