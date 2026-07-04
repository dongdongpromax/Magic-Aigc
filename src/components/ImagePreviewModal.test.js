import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImagePreviewModal from './ImagePreviewModal.vue'

describe('ImagePreviewModal', () => {
  it('已停用自定义预览弹层', () => {
    const wrapper = mount(ImagePreviewModal, {
      props: {
        visible: true,
        activeIndex: 0,
        images: [{ id: '1', url: 'data:image/png;base64,ZmFrZQ==' }],
      },
    })

    expect(wrapper.find('.image-preview-modal-deprecated').exists()).toBe(true)
    expect(wrapper.text()).toContain('已停用')
  })
})
