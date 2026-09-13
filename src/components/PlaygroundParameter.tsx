import { Slider } from 'radix-ui';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  formatLabel,
  formatOptionValue,
  formatQuantity,
  isFreeNumber,
} from '../format';
import { useI18n } from '../i18n';
import type { FormParameter } from '../types';

type Parameters = Record<string, string>;

// PlaygroundParameter is one declared parameter in a playground form: a slider
// for a duration, a count, or any bounded number, a select for a vocabulary or
// a switch, and a field for the rest. The image and video playgrounds share it.
export function PlaygroundParameter({
  param,
  parameters,
  setParameters,
  help,
}: {
  param: FormParameter;
  parameters: Parameters;
  setParameters: Dispatch<SetStateAction<Parameters>>;
  help?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const label = formatLabel(param.name);
  const set = (value: string) =>
    setParameters((prev) => ({ ...prev, [param.name]: value }));
  const heading = (
    <span className="playground-param-label">
      {label}
      {help}
    </span>
  );

  const isDuration = /duration|second/i.test(param.name);
  const isCount =
    /^(n|count|quantity|num_outputs|number_of_images|samples|batch_size|image_num)$/i.test(
      param.name,
    ) || label === '数量';
  const freeNumber = isFreeNumber(param.name, param.minimum, param.maximum);
  const isRanged =
    !freeNumber &&
    param.type === 'integer' &&
    param.minimum !== undefined &&
    param.maximum !== undefined &&
    param.maximum > param.minimum;

  if (!freeNumber && (isDuration || isCount || isRanged)) {
    if (param.enum?.length) {
      const options = param.enum;
      const currentVal =
        parameters[param.name] ??
        (param.default !== undefined ? String(param.default) : options[0]);
      const currentIndex = Math.max(0, options.indexOf(currentVal));
      const currentNum = Number(options[currentIndex] ?? options[0]);
      const optionLabel = (option: string) =>
        Number.isNaN(Number(option))
          ? option
          : formatQuantity(param.name, Number(option));
      return (
        <div className="playground-slider-col">
          <div className="playground-slider-header">
            {heading}
            <span className="playground-slider-value">
              {Number.isNaN(currentNum)
                ? (options[currentIndex] ?? options[0])
                : formatQuantity(param.name, currentNum)}
            </span>
          </div>
          <Slider.Root
            className="slider"
            min={0}
            max={options.length - 1}
            step={1}
            value={[currentIndex]}
            onValueChange={([index]) => set(options[index])}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" aria-label={label} />
          </Slider.Root>
          <div className="slider-scale">
            {options.length <= 6 ? (
              options.map((option, index) => (
                <small
                  key={option}
                  style={
                    index === currentIndex
                      ? { fontWeight: 700, color: 'var(--accent)' }
                      : undefined
                  }
                >
                  {optionLabel(option)}
                </small>
              ))
            ) : (
              <>
                <small>{optionLabel(options[0])}</small>
                <small>{optionLabel(options[options.length - 1])}</small>
              </>
            )}
          </div>
        </div>
      );
    }

    const min =
      param.minimum !== undefined
        ? Number(param.minimum)
        : isCount
          ? 1
          : isDuration
            ? 5
            : 1;
    const max =
      param.maximum !== undefined
        ? Number(param.maximum)
        : isCount
          ? 4
          : isDuration
            ? 10
            : 100;
    const rawVal =
      parameters[param.name] ??
      (param.default !== undefined ? String(param.default) : String(min));
    const current = Number(rawVal) || min;

    return (
      <div className="playground-slider-col">
        <div className="playground-slider-header">
          {heading}
          <span className="playground-slider-value">
            {formatQuantity(param.name, current)}
          </span>
        </div>
        <Slider.Root
          className="slider"
          min={min}
          max={max}
          step={1}
          value={[current]}
          onValueChange={([next]) => set(String(next))}
        >
          <Slider.Track className="slider-track">
            <Slider.Range className="slider-range" />
          </Slider.Track>
          <Slider.Thumb className="slider-thumb" aria-label={label} />
        </Slider.Root>
        <div className="slider-scale">
          {max - min <= 5 ? (
            Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
              (num) => (
                <small
                  key={num}
                  style={
                    num === current
                      ? { fontWeight: 700, color: 'var(--accent)' }
                      : undefined
                  }
                >
                  {formatQuantity(param.name, num)}
                </small>
              ),
            )
          ) : (
            <>
              <small>{formatQuantity(param.name, min)}</small>
              <small>{formatQuantity(param.name, max)}</small>
            </>
          )}
        </div>
      </div>
    );
  }

  if (param.type === 'boolean') {
    return (
      <div className="playground-param-col">
        {heading}
        <select
          className="playground-select"
          aria-label={label}
          value={
            parameters[param.name] ??
            (param.default !== undefined ? String(param.default) : '')
          }
          onChange={(e) => set(e.target.value)}
        >
          {!param.required && <option value="">{t('composer.auto')}</option>}
          <option value="true">{t('playground.on')}</option>
          <option value="false">{t('playground.off')}</option>
        </select>
      </div>
    );
  }

  return (
    <div className="playground-param-col">
      {heading}
      {param.enum?.length ? (
        <select
          className="playground-select"
          aria-label={label}
          value={parameters[param.name] ?? ''}
          onChange={(e) => set(e.target.value)}
        >
          {!param.required &&
            !param.enum.some((opt) => opt.toLowerCase() === 'auto') && (
              <option value="">{t('composer.auto')}</option>
            )}
          {param.enum.map((opt) => (
            <option key={opt} value={opt}>
              {formatOptionValue(param.name, opt, locale)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={param.type === 'integer' ? 'number' : 'text'}
          className="playground-input"
          aria-label={label}
          min={param.minimum}
          max={param.maximum}
          step={param.type === 'integer' ? 1 : undefined}
          placeholder={freeNumber ? t('composer.seedPlaceholder') : undefined}
          value={parameters[param.name] ?? ''}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </div>
  );
}
